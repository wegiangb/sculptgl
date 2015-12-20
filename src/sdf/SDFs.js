define(function (require, exports, module) {

  'use strict';

  var glm = require('lib/glMatrix');
  var Utils = require('misc/Utils');

  var vec2 = glm.vec2;
  var vec3 = glm.vec3;
  var mat4 = glm.mat4;

  var vec3abs = function (a, b) {
    a[0] = Math.abs(b[0]);
    a[1] = Math.abs(b[1]);
    a[2] = Math.abs(b[2]);
    return a;
  };
  var v3zero = [0.0, 0.0, 0.0]; // should not be modified
  var m4identity = mat4.create(); // should not be modified
  var tmp3 = [0.0, 0.0, 0.0];

  var toVec3str = function (arr) {
    return 'vec3(' + arr[0].toExponential() + ',' + arr[1].toExponential() + ',' + arr[2].toExponential() + ')';
  };
  var toVec2str = function (arr) {
    return 'vec2(' + arr[0].toExponential() + ',' + arr[1].toExponential() + ')';
  };

  ///////////
  // ABSTRACT
  ///////////

  var BasePrimitive = function (id) {
    this._id = id;
    this._center = [0.0, 0.0, 0.0];
    this._editMatrix = mat4.create();
    this._uniformNames = ['uPrimitivePos'];
    this._selected = false;
  };
  BasePrimitive.prototype = {
    getID: function () {
      return this._id;
    },
    declareUniforms: function () {
      return 'uniform vec3 uPrimitivePos;';
    },
    updateUniforms: function (gl, uniforms) {
      gl.uniform3fv(uniforms.uPrimitivePos, this.getPosition());
    },
    getUniformNames: function () {
      return this._uniformNames;
    },
    getSelected: function () {
      return this._selected;
    },
    setSelected: function (bool) {
      this._selected = bool;
    },
    shaderDistanceMat: function () {
      var str = this.shaderDistance();
      return 'vec2(' + str + ', ' + this._id.toFixed(1) + ')';
    },
    getPosition: function () {
      return vec3.transformMat4(tmp3, this._center, this._editMatrix);
    },
    getPositionStr: function () {
      if (this._selected)
        return 'uPrimitivePos';

      var cen = this._center;
      cen = vec3.transformMat4(tmp3, cen, this._editMatrix);
      return 'vec3(' + cen[0].toExponential() + ',' + cen[1].toExponential() + ',' + cen[2].toExponential() + ')';
    },
    getCenter: function () {
      return this._center;
    },
    getMatrix: function () {
      return m4identity;
    },
    getEditMatrix: function () {
      return this._editMatrix;
    }
  };

  var SDFs = {};

  ////////
  // PLANE
  ////////
  SDFs.PLANE = function (id) {
    BasePrimitive.call(this, id);
  };
  SDFs.PLANE.prototype = {
    shaderDistance: function () {
      return 'sdPlane(point - ' + this.getPositionStr() + ')';
    },
    distanceTo: function (p) {
      vec3.sub(tmp3, p, this._center);
      return tmp3[1];
    }
  };
  Utils.makeProxy(BasePrimitive, SDFs.PLANE);

  /////////
  // SPHERE
  /////////
  SDFs.SPHERE = function (id) {
    BasePrimitive.call(this, id);
    this._center[0] = -10.0;
    this._center[1] = 3.0;

    this._radius = 4.0;
  };
  SDFs.SPHERE.prototype = {
    shaderDistance: function () {
      return 'sdSphere(point - ' + this.getPositionStr() + ', ' + this._radius.toExponential() + ')';
    },
    distanceTo: function (p) {
      vec3.sub(tmp3, p, this._center);
      return vec3.len(tmp3) - this._radius;
    }
  };
  Utils.makeProxy(BasePrimitive, SDFs.SPHERE);

  //////
  // BOX
  //////
  SDFs.BOX = function (id) {
    BasePrimitive.call(this, id);
    this._center[0] = -5.0;
    this._center[1] = 0.25;

    this._side = [4.0, 4.0, 4.0];
  };
  SDFs.BOX.prototype = {
    shaderDistance: function () {
      return 'sdBox(point - ' + this.getPositionStr() + ', ' + toVec3str(this._side) + ')';
    },
    distanceTo: function (p) {
      vec3.sub(tmp3, p, this._center);
      vec3abs(tmp3, tmp3);
      vec3.sub(tmp3, tmp3, this._side);
      return Math.min(Math.max(tmp3[0], Math.max(tmp3[1], tmp3[2])), 0.0) + vec3.len(vec3.max(tmp3, tmp3, v3zero));
    }
  };
  Utils.makeProxy(BasePrimitive, SDFs.BOX);

  ////////
  // TORUS
  ////////
  SDFs.TORUS = function (id) {
    BasePrimitive.call(this, id);
    this._center[0] = 5.0;
    this._center[1] = 0.25;

    this._side = [4.0, 0.5];
  };
  SDFs.TORUS.prototype = {
    shaderDistance: function () {
      return 'sdTorus(point - ' + this.getPositionStr() + ', ' + toVec2str(this._side) + ')';
    },
    distanceTo: function (p) {
      vec3.sub(tmp3, p, this._center);
      return vec2.len([Math.sqrt(tmp3[0] * tmp3[0] + tmp3[2] * tmp3[2]) - this._side[0], tmp3[1]]) - this._side[1];
    }
  };
  Utils.makeProxy(BasePrimitive, SDFs.TORUS);

  ////////
  // UNION
  ////////
  SDFs.opUNION = function (op1, op2) {
    this._op1 = op1;
    this._op2 = op2;
  };
  SDFs.opUNION.prototype = {
    shaderDistance: function () {
      return 'opU(' + this._op1.shaderDistanceMat() + '\n, ' + this._op2.shaderDistanceMat() + ')';
    },
    distanceTo: function (p) {
      return this._op1.distanceTo(p) < this._op2.distanceTo(p) ? this._op1 : this._op2;
    }
  };

  //////
  // SUB
  //////
  SDFs.opSUB = function (op1, op2) {
    this._op1 = op1;
    this._op2 = op2;
    this._id = op1._id;
  };
  SDFs.opSUB.prototype = {
    shaderDistanceMat: BasePrimitive.prototype.shaderDistanceMat,
    shaderDistance: function () {
      return 'opS(' + this._op1.shaderDistance() + '\n, ' + this._op2.shaderDistance() + ')';
    },
    distanceTo: function (p) {
      return Math.max(-this._op2.distanceTo(p), this._op1.distanceTo(p));
    }
  };
  Utils.makeProxy(BasePrimitive, SDFs.opSUB, function (proto) {
    return function () {
      return proto.apply(this._op1, arguments);
    };
  });

  SDFs.keys = Object.keys(SDFs);

  module.exports = SDFs;
});