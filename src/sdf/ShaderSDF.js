define(function (require, exports, module) {

  'use strict';

  var ShaderBase = require('render/shaders/ShaderBase');
  var Attribute = require('render/Attribute');
  var sdfGLSL = require('text!sdf/SDF.glsl');
  var glm = require('lib/glMatrix');

  var mat3 = glm.mat3;

  var ShaderSDF = ShaderBase.getCopy();
  ShaderSDF.vertexName = ShaderSDF.fragmentName = 'SDF';

  ShaderSDF.uniforms = {};
  ShaderSDF.attributes = {};

  ShaderSDF.uniformNames = ['uInvSize', 'uOrigin', 'uView'];

  ShaderSDF.vertex = [
    'precision mediump float;',
    'attribute vec2 aVertex;',
    'varying vec2 vUV;',
    'void main() {',
    '  vUV = aVertex * 0.5 + 0.5;',
    '  gl_Position = vec4(aVertex, 0.5, 1.0);',
    '}'
  ].join('\n');

  ShaderSDF.fragment = [
    'precision mediump float;',
    'uniform vec3 uOrigin;',
    'uniform mat3 uView;',
    'uniform vec2 uInvSize;',
    'varying vec2 vUV;',
    '%ID_UNIFORM',
    sdfGLSL,
    'void main() {',
    '  gl_FragColor = vec4(raymarch(uOrigin, uView, vUV, uInvSize), 1.0);',
    '}'
  ].join('\n');

  ShaderSDF.createFragment = function (mainSDF) {
    var str = ShaderSDF.fragment.replace('%ID_MAP', 'return ' + mainSDF._sceneSDF[0].shaderDistance() + ';');
    var mesh = mainSDF._main.getMesh();
    if (mesh)
      str = str.replace('%ID_UNIFORM', mesh.declareUniforms());
    else
      str = str.replace('%ID_UNIFORM', '\n');
    return str;
  };

  ShaderSDF.getOrCreate = function () {
    return this;
  };

  ShaderSDF.generateProgram = function (mainSDF) {
    var gl = mainSDF._gl;

    if (this.program)
      gl.deleteProgram(this.program);

    if (!this.vShader) {
      this.vShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(this.vShader, this.vertex);
      gl.compileShader(this.vShader);
    }

    var fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fShader, ShaderSDF.createFragment(mainSDF));
    gl.compileShader(fShader);

    var program = this.program = gl.createProgram();

    gl.attachShader(program, this.vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    var logV = gl.getShaderInfoLog(this.vShader);
    var logF = gl.getShaderInfoLog(fShader);
    var logP = gl.getProgramInfoLog(program);
    if (logV) console.warn(this.vertexName + ' (vertex)\n' + logV);
    if (logF) console.warn(this.fragmentName + ' (fragment)\n' + logF);
    if (logP) console.warn(this.fragmentName + ' (program)\n' + logP);

    if (!this.attributes.aVertex)
      this.initAttributes(gl);

    ShaderSDF.uniformNames.length = 0;
    ShaderSDF.uniformNames.push('uInvSize', 'uOrigin', 'uView');

    var mesh = mainSDF._main.getMesh();
    if (mesh)
      ShaderSDF.uniformNames.push.apply(ShaderSDF.uniformNames, mesh.getUniformNames());

    this.initUniforms(gl);

    return program;
  };

  ShaderSDF.draw = function (rtt, main) {
    var gl = rtt.getGL();

    if (main._mainSDF._dirtyScene) {
      main._mainSDF._dirtyScene = false;

      if (main.getMesh())
        main.getMesh().setSelected(true);

      ShaderSDF.generateProgram(main._mainSDF);

      if (main.getMesh())
        main.getMesh().setSelected(false);
    }

    gl.useProgram(this.program);

    ShaderSDF.attributes.aVertex.bindToBuffer(rtt.getVertexBuffer());

    gl.uniform2fv(this.uniforms.uInvSize, rtt.getInverseSize());

    var camera = main.getCamera();
    var origin = camera.unproject(camera._width * 0.5, camera._height * 0.5, 0.0);
    gl.uniform3fv(this.uniforms.uOrigin, origin);

    var view = camera._sdfView;
    mat3.normalFromMat4(view, camera.getView());
    mat3.invert(view, view);
    view[6] *= -1.0;
    view[7] *= -1.0;
    view[8] *= -1.0;
    gl.uniformMatrix3fv(this.uniforms.uView, false, view);

    if (main.getMesh())
      main.getMesh().updateUniforms(gl, this.uniforms);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  ShaderSDF.initAttributes = function (gl) {
    ShaderSDF.attributes.aVertex = new Attribute(gl, ShaderSDF.program, 'aVertex', 2, gl.FLOAT);
  };

  module.exports = ShaderSDF;
});