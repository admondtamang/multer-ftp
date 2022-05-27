var Promise = require("bluebird");
var os = require("os");
var FTP = require("ftp");
var fs = require("fs");
var path = require("path");
var defaults = require("lodash.defaults");
var random = Promise.promisify(require("crypto").randomBytes);
var crypto = require("crypto");

var date = Date.now() + "--";
function getDestination(req, file, opts, cb) {
  random(16).then(function (raw) {
    cb(null, date + file.originalname);
  }, cb);
}

function FTPStorage(opts) {
  this.opts = defaults(opts, {
    basepath: "",
    destination: getDestination,
  });

  if (this.opts.connection) {
    this.ftp = this.opts.connection;
    this.ready = Promise.resolve();
  } else {
    this.ftp = new FTP();
    this.ready = new Promise(
      function (resolve, reject) {
        this.ftp.on("ready", resolve);
      }.bind(this)
    );

    this.ftp.connect(this.opts.ftp);
  }
}

FTPStorage.prototype._handleFile = function _handleFile(req, file, cb) {
  var instance = this;
  var obj = {};

  function handleFile(stream) {
    // ftp
    instance.opts.destination(req, file, instance.opts, function (err, destination) {
      if (err) return cb(err);

      function getFilename(req, file, cb) {
        cb(null, date + file.originalname);
      }

      getFilename(req, file, (err, filename) => {
        const destination = os.tmpdir();
        if (err) return cb(err);

        var finalPath = path.join(destination, filename);
        var outStream = fs.createWriteStream(finalPath);

        file.stream.pipe(outStream);
        outStream.on("error", cb);
        outStream.on("finish", function () {
          obj = {
            filename: filename,
            size: outStream.bytesWritten,
          };
        });
      }); // end of fileName

      instance.ftp.put(stream, destination, function (err) {
        if (err) return cb(err);
        cb(null, {
          path: destination,
          ...obj,
        });
      }); //end of ftp
    });
  }

  instance.ready.then(function () {
    if (instance.opts.transformFile) {
      instance.opts.transformFile(req, file, function (err, stream) {
        if (err) return cb(err);

        file.transformedStream = stream;

        handleFile(file.transformedStream);
      });
    } else {
      handleFile(file.stream);
    }
  });
};

FTPStorage.prototype._removeFile = function _removeFile(req, file, cb) {
  this.ready.then(
    function () {
      this.ftp.delete(file.path, cb);
    }.bind(this)
  );
};

module.exports = FTPStorage;
