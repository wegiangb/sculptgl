define(function (require, exports, module) {

  'use strict';

  // var TR = require('gui/GuiTR');
  var zip = require('lib/zip');
  var ExportPLY = require('files/ExportPLY');

  var Export = {};

  Export.exportMaterialise = function (main, key, statusWidget) {
    var xhr = new XMLHttpRequest();
    var domStatus = statusWidget.domContainer;
    statusWidget.setVisibility(true);
    statusWidget.materialise = true;
    domStatus.innerHTML = 'Uploading...';
    xhr.open('POST', 'https://i.materialise.com/upload', true);

    xhr.onprogress = function (event) {
      if (event.lengthComputable)
        domStatus.innerHTML = 'Uploading : ' + Math.round(event.loaded * 100.0 / event.total) + '%';
    };
    var hideStatus = function () {
      statusWidget.setVisibility(false);
      statusWidget.materialise = false;
    };
    xhr.onerror = hideStatus;
    xhr.onabort = hideStatus;

    xhr.onload = function () {
      hideStatus();
    };

    zip.useWebWorkers = true;
    zip.workerScriptsPath = 'worker/';
    zip.createWriter(new zip.BlobWriter('application/zip'), function (zipWriter) {
      zipWriter.add('yourMesh.ply', new zip.BlobReader(ExportPLY.exportBinaryPLY(main.getMeshes(), true)), function () {
        zipWriter.close(Export.exportFileMaterialise.bind(this, main, key, xhr));
      });
    }, onerror);

    return xhr;
  };

  Export.exportFileMaterialise = function (main, key, xhr, blob) {
    var fd = new FormData();
    fd.append('plugin', key);
    fd.append('forceEmbedding', false);
    fd.append('file', blob);
    xhr.send(fd);
  };

  module.exports = Export;
});