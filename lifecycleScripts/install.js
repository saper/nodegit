var promisify = require("promisify-node");
var path = require("path");
var fs = require("fs");

var whichNativeNodish = require("which-native-nodish");
var prepareForBuild = require("./prepareForBuild");

var exec = promisify(function(command, opts, callback) {
  return require("child_process").exec(command, opts, callback);
});
var nwVersion = null;
var asVersion = null;

var local = path.join.bind(path, __dirname);

return whichNativeNodish("..")
  .then(function(results) {
    nwVersion = results.nwVersion;
    asVersion = results.asVersion;
  })
  .then(function() {
    if (nwVersion) {
      console.info("[nodegit] Must build for node-webkit/nw.js");
      return prepareAndBuild();
    }
    else if (asVersion) {
      console.info("[nodegit] Must build for atom-shell");
      return prepareAndBuild();
    }
    if (fs.existsSync(local("../.didntcomefromthenpmregistry"))) {
      return prepareAndBuild();
    }
    if (process.env.BUILD_DEBUG) {
      console.info("[nodegit] Doing a debug build, no fetching allowed.");
      return prepareAndBuild();
    }
    if (process.env.BUILD_ONLY) {
      console.info("[nodegit] BUILD_ONLY is set to true, no fetching allowed.");
      return prepareAndBuild();
    }
    console.info("[nodegit] Fetching binary from S3.");
    return exec("node-pre-gyp install")
      .then(
        function() {
          console.info("[nodegit] Completed installation successfully.");
        },
        function() {
          console.info("[nodegit] Failed to install prebuilt binary, " +
            "building manually.");
          return prepareAndBuild();
        }
      );
  });


function prepareAndBuild() {
  console.info("[nodegit] Regenerating and configuring code");
  return prepareForBuild()
    .then(function() {
      return build();
    });
}

function build() {
  console.info("[nodegit] Everything is ready to go, attempting compilation");
  if (nwVersion) {
    console.info("[nodegit] Building native node-webkit module.");
  }
  else {
    console.info("[nodegit] Building native node module.");
  }

  var procenv = {};
  for (var envvar in process.env) {
    if (envvar !== "npm_config_argv" && process.env[envvar]) {
      procenv[envvar] = process.env[envvar];
    }
  }

  var opts = {
    cwd: ".",
    maxBuffer: Number.MAX_VALUE,
    env: procenv
  };

  console.info("options:", opts);
  var prefix = "";
  var target = "";
  var debug = (process.env.BUILD_DEBUG ? " --debug" : "");
  var builder = "pangyp";
  var distUrl = "";

  if (asVersion) {
    prefix = (process.platform == "win32" ?
      "SET HOME=%HOME%\\.atom-shell-gyp&& " :
      "HOME=~/.atom-shell-gyp");

    target = "--target=" + asVersion;

    distUrl = "--dist-url=https://gh-contractor-zcbenz.s3." +
      "amazonaws.com/atom-shell/dist";
  }
  else if (nwVersion) {
    builder = "nw-gyp";
    target = "--target=" + nwVersion;
  }

  return exec("npm install --ignore-scripts")
    .then(function() {
      builder = path.resolve(".", "node_modules", ".bin", builder);
      builder = builder.replace(/\s/g, "\\$&");
      var cmd = [prefix, builder, "rebuild", target, debug, distUrl]
        .join(" ").trim();

      return exec(cmd, opts);
    })
    .then(function() {
      console.info("[nodegit] Compilation complete.");
      console.info("[nodegit] Completed installation successfully.");
    },
    function(err, stderr) {
      console.error(err);
      console.error(stderr);
    });
}
