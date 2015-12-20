define(function (require, exports, module) {

  'use strict';

  var Rtt = require('drawables/Rtt');
  require('render/ShaderLib').SDF = require('sdf/ShaderSDF');
  var GuiCamera = require('gui/GuiCamera');
  var SDFs = require('sdf/SDFs');
  var Gizmo = require('editing/Gizmo');
  var glm = require('lib/glMatrix');

  var vec3 = glm.vec3;
  var mat3 = glm.mat3;
  var mat4 = glm.mat4;

  var MainSDF = function (main) {
    this._main = main;
    this._gl = main._gl;
    this._rttSDF = new Rtt(this._gl, 'SDF', null);

    this._sceneSDF = [];
    this._dirtyScene = true;

    this._hookSculptGL();

    this._initScene();
    this.onCanvasResize(main._canvasWidth, main._canvasHeight);
  };

  MainSDF.prototype = {
    _initScene: function () {
      var box = new SDFs.BOX(1);
      var sphere = new SDFs.SPHERE(2);
      var torus = new SDFs.TORUS(3);

      var opS = new SDFs.opSUB(box, sphere);
      var opU = new SDFs.opUNION(opS, torus);

      this._sceneSDF.push(opU);
    },
    _hookSculptGL: function () {
      var main = this._main;
      main.clearScene();

      this._main.applyRender = this._applyRender.bind(this);
      this._main.onDeviceDown = this._onDeviceDown.bind(this);

      this._hookCamera();
      this._hookGui();
      this._hookPicking();
      this._hookSculpt();
    },
    _hookCamera: function () {
      var camera = this._main.getCamera();
      camera.setFov(53);
      camera.updateProjection();
      camera._sdfView = mat3.create();
      this._main._gui._ctrlCamera._ctrlPivot.setValue(false);
    },
    _hookPicking: function () {
      var main = this._main;
      var picking = main.getPicking();
      var mainScene = main.getMeshes();
      var self = this;
      var oldInter = picking.intersectionMouseMeshes;
      picking.intersectionMouseMeshes = function (meshes, mx, my) {
        if (mainScene === meshes || !meshes)
          return self.intersects();
        return oldInter.call(this, meshes, mx, my);
      };
    },
    _onDeviceDown: function (event) {
      var main = this._main;
      if (main._focusGui)
        return;

      main.setMousePosition(event);

      var mouseX = main._mouseX;
      var mouseY = main._mouseY;
      var button = event.which;

      main._sculpt.start(event.shiftKey);
      var pickedMesh = main._picking.getMesh();

      if (pickedMesh)
        main._action = 'SCULPT_EDIT';
      else if (event.ctrlKey)
        main._action = 'CAMERA_ZOOM';
      else if (event.altKey)
        main._action = 'CAMERA_PAN_ZOOM_ALT';
      else if (button === 2 || button === 3)
        main._action = 'CAMERA_PAN';
      else
        main._action = 'CAMERA_ROTATE';

      if (main._action === 'CAMERA_ROTATE' || main._action === 'CAMERA_ZOOM')
        main._camera.start(mouseX, mouseY);

      main._lastMouseX = mouseX;
      main._lastMouseY = mouseY;
    },
    _hookSculpt: function () {
      var self = this;
      var main = this._main;
      var picking = main.getPicking();
      // force transform tool
      var sculpt = this._main.getSculpt();
      sculpt._tool = 'TRANSFORM';

      var transformTool = sculpt.getCurrentTool();
      transformTool._gizmo.setActivatedType(Gizmo.TRANS_XYZ | Gizmo.PLANE_XYZ);

      transformTool.start = function () {
        var mesh = this.getMesh();
        if (mesh && this._gizmo.onMouseDown()) {
          this.pushState();
          picking._mesh = mesh;
          return;
        }

        picking._mesh = null;
        this._lastMouseX = main._mouseX;
        this._lastMouseY = main._mouseY;
      };

      transformTool.end = function () {
        this._gizmo.onMouseUp();

        var dx = Math.abs(main._mouseX - this._lastMouseX);
        var dy = Math.abs(main._mouseY - this._lastMouseY);
        if (dx * dx + dy * dy < 4.0) {
          self.intersects();
          if (main.getMesh() !== picking.getMesh())
            self._dirtyScene = true;
          main.setMesh(picking.getMesh());
          return;
        }

        var mesh = this.getMesh();
        if (!mesh)
          return;

        if (this.isIdentity(mesh.getEditMatrix()))
          return;

        vec3.transformMat4(mesh.getCenter(), mesh.getCenter(), mesh.getEditMatrix());
        mat4.identity(mesh.getEditMatrix());
      };
    },
    _hookGui: function () {
      var main = this._main;
      var gui = main.getGui();
      for (var i = 0, ctrls = gui._ctrls, nb = ctrls.length; i < nb; ++i) {
        var ct = ctrls[i];
        // keep camera and config
        if (ct instanceof GuiCamera)
          continue;
        if (ct.removeEvents) ct.removeEvents();
        if (ct._menu) ct._menu.setVisibility(false);
        ctrls[i] = null;
      }

      gui.updateMesh = function () {};

      gui._ctrlCamera._ctrlProjectionTitle.setVisibility(false);
      gui._ctrlCamera._ctrlProjection.setVisibility(false);
      gui._ctrlCamera._ctrlFov.setVisibility(false);

      var sidebar = gui._sidebar;
      sidebar.addMenu('SDF');
    },
    onCanvasResize: function (width, height) {
      this._rttSDF.onResize(width, height);
    },
    _applyRender: function () {
      var main = this._main;
      main._preventRender = false;

      var gl = this._gl;
      if (!gl) return;

      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, main._rttMerge.getFramebuffer());
      this._rttSDF.render(main);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      main._rttOpaque.render(main); // fxaa
      main._selection.render(main);
      main._sculpt.postRender();

      gl.enable(gl.DEPTH_TEST);
    },
    intersects: function () {
      var main = this._main;
      var camera = main.getCamera();
      var width = main._canvasWidth;
      var height = main._canvasHeight;

      var mx = (-1.0 + 2.0 * (main._mouseX / width)) * (width / height);
      var my = -1.0 + 2.0 * (1.0 - main._mouseY / height);

      var dir = [mx, my, 2.0];
      vec3.normalize(dir, dir);
      vec3.transformMat3(dir, dir, main.getCamera()._sdfView);

      var origin = camera.unproject(camera._width * 0.5, camera._height * 0.5, 0.0);

      return this.castRay(origin, dir);
    },
    castRay: function (ro, rd) {
      var tmin = 1.0;
      var tmax = 200.0;

      var precis = 0.02;
      var t = tmin;
      var point = [0.0, 0.0, 0.0];
      var root = this._sceneSDF[0];

      var inter = null;
      for (var i = 0; i < 50; ++i) {
        vec3.scaleAndAdd(point, ro, rd, t);
        var interTest = root.distanceTo(point);
        var dist = interTest.distanceTo(point);

        if (dist < precis || t > tmax) break;
        t += dist;
        inter = interTest;
      }

      var picking = this._main.getPicking();
      if (t > tmax || !inter) {
        picking._mesh = null;
        return null;
      }

      vec3.copy(picking.getIntersectionPoint(), point);
      picking._mesh = inter;

      return inter;
    }
  };

  module.exports = MainSDF;
});