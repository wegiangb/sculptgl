define([
  'lib/glMatrix',
  'misc/Utils',
  'misc/Tablet',
  'editor/tools/SculptBase',
  'editor/tools/Flatten'
], function (glm, Utils, Tablet, SculptBase, Flatten) {

  'use strict';

  var vec3 = glm.vec3;

  function Brush(states) {
    SculptBase.call(this, states);
    this.intensity_ = 0.5;
    this.negative_ = false;
    this.clay_ = true;
    this.culling_ = false; // if we backface cull the vertices
    this.accumulate_ = true; // if we ignore the proxy
    this.idAlpha_ = 0;

    this.lockPosition_ = false;
    this.lastVerts_ = null;
    this.lastFaces_ = null;
    this.lastVertsSym_ = null;
    this.lastFacesSym_ = null;
  }

  Brush.prototype = {
    startSculpt: function (main) {
      this.lastVerts_ = this.lastFaces_ = this.lastVertsSym_ = this.lastFacesSym_ = null;
      SculptBase.prototype.startSculpt.call(this, main);
    },
    update: function (main) {
      if (this.lockPosition_ === false)
        return this.sculptStroke(main);
      this.updateSculptLock(main);
    },
    updateSculptLock: function (main) {
      var dx = main.mouseX_ - this.lastMouseX_;
      var dy = main.mouseY_ - this.lastMouseY_;

      var picking = main.getPicking();
      var origRad = picking.getScreenRadius();
      var pickingSym = main.getSculpt().getSymmetry() ? main.getPickingSymmetry() : null;

      this.applyBackOldEdit(this.lastVerts_, this.lastFaces_);
      this.applyBackOldEdit(this.lastVertsSym_, this.lastFacesSym_);

      picking.rDisplay_ = Math.sqrt(dx * dx + dy * dy);
      this.makeStroke(this.lastMouseX_, this.lastMouseY_, picking, pickingSym);
      picking.rDisplay_ = origRad;

      this.updateRender(main);
    },
    applyBackOldEdit: function (iVerts, iFaces) {
      if (!iVerts) return;
      var mesh = this.mesh_;
      var vAr = mesh.getVertices();
      var vProxy = mesh.getVerticesProxy();
      for (var i = 0, nb = iVerts.length; i < nb; ++i) {
        var ind = iVerts[i] * 3;
        vAr[ind] = vProxy[ind];
        vAr[ind + 1] = vProxy[ind + 1];
        vAr[ind + 2] = vProxy[ind + 2];
      }
      mesh.updateGeometry(iFaces, iVerts);
    },
    stroke: function (picking, isSym) {
      var iVertsInRadius = picking.getPickedVertices();
      var intensity = this.intensity_ * Tablet.getPressureIntensity();

      if (!this.accumulate_ || this.lockPosition_)
        this.updateProxy(iVertsInRadius);
      // undo-redo
      this.states_.pushVertices(iVertsInRadius);
      if (!this.lockPosition_)
        iVertsInRadius = this.dynamicTopology(picking);

      var iVertsFront = this.getFrontVertices(iVertsInRadius, picking.getEyeDirection());
      if (this.culling_)
        iVertsInRadius = iVertsFront;

      var r2 = picking.getLocalRadius2();
      picking.updateAlpha();
      picking.setIdAlpha(this.idAlpha_);
      if (!this.clay_) {
        this.brush(iVertsInRadius, picking.getPickedNormal(), picking.getIntersectionPoint(), r2, intensity, picking);
      } else {
        var aNormal = this.areaNormal(iVertsFront);
        if (!aNormal)
          return;
        var aCenter = this.areaCenter(iVertsFront);
        var off = Math.sqrt(r2) * 0.1;
        vec3.scaleAndAdd(aCenter, aCenter, aNormal, this.negative_ ? -off : off);
        Flatten.prototype.flatten.call(this, iVertsInRadius, aNormal, aCenter, picking.getIntersectionPoint(), r2, intensity, picking);
      }

      var idFaces = this.mesh_.getFacesFromVertices(iVertsInRadius);
      this.mesh_.updateGeometry(idFaces, iVertsInRadius);
      if (isSym) {
        this.lastVerts_ = iVertsInRadius;
        this.lastFaces_ = idFaces;
      } else {
        this.lastVertsSym_ = iVertsInRadius;
        this.lastFacesSym_ = idFaces;
      }
    },
    brush: function (iVertsInRadius, aNormal, center, radiusSquared, intensity, picking) {
      var mesh = this.mesh_;
      var vAr = mesh.getVertices();
      var mAr = mesh.getMaterials();
      var vProxy = this.accumulate_ || this.lockPosition_ ? vAr : mesh.getVerticesProxy();
      var radius = Math.sqrt(radiusSquared);
      var deformIntensityBrush = intensity * radius * 0.1;
      if (this.negative_)
        deformIntensityBrush = -deformIntensityBrush;
      var cx = center[0];
      var cy = center[1];
      var cz = center[2];
      var anx = aNormal[0];
      var any = aNormal[1];
      var anz = aNormal[2];
      for (var i = 0, l = iVertsInRadius.length; i < l; ++i) {
        var ind = iVertsInRadius[i] * 3;
        var dx = vProxy[ind] - cx;
        var dy = vProxy[ind + 1] - cy;
        var dz = vProxy[ind + 2] - cz;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
        if (dist >= 1.0)
          continue;
        var vx = vAr[ind];
        var vy = vAr[ind + 1];
        var vz = vAr[ind + 2];
        var fallOff = dist * dist;
        fallOff = 3.0 * fallOff * fallOff - 4.0 * fallOff * dist + 1.0;
        fallOff *= mAr[ind + 2] * deformIntensityBrush * picking.getAlpha(vx, vy, vz);
        vAr[ind] = vx + anx * fallOff;
        vAr[ind + 1] = vy + any * fallOff;
        vAr[ind + 2] = vz + anz * fallOff;
      }
    }
  };

  Utils.makeProxy(SculptBase, Brush);

  return Brush;
});