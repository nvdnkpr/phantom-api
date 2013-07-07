/****************************************************************************
* Phantom Server
*
* This Node.js based HTTP server provides the following built-in
* capabilities:
*
*     - serves static files (ending in .html)
*     - serves static CSS, JavaScript, and image files
*     - integrated API for web services
* 
* Phantom's design philosophy is to provide a flexible, ready-to-go
* web framework with extremely simple setup requirments. It's fun!
* 
* Documentation:
* 
*     http://github.com/gold/phantom
*
* Copyright (c) 2013-Eternity by gold and Channelping.
*
* Permission is hereby granted, free of charge, to any person
* obtaining a copy of this software and associated documentation files
* (the "Software"), to deal in the Software without restriction,
* including without limitation the rights to use, copy, modify, merge,
* publish, distribute, sublicense, and/or sell copies of the Software,
* and to permit persons to whom the Software is furnished to do so,
* subject to the following conditions:
*
* The above copyright notice and this permission notice shall be
* included in all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
* NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
* BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
* ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
* CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
****************************************************************************/

// Node modules
var http = require("http"),
    url  = require("url"),
    qs   = require('querystring'),
    fs   = require("fs"),
    path = require("path"),
    util = require("util");

// If HOST is not overridden in the application's user-defined
// config.js, then server.list() omits the host argument; the server
// will then accept connections directed to any IPv4 address
// (INADDR_ANY)
var DEFAULT_CONFIG = {
          DOC_ROOT: "/var/www/public/",
              PORT: 8008,
              HOST: null,
      X_POWERED_BY: "Phantom Frameworks, Ltd.",
       SERVER_NAME: "Phantom Node.js/" + process.version,
  CACHE_INDEX_FILE: false,
      LOG_FILENAME: "/var/www/log/phantom_server.log"
};

// This is the name of the user-defined configuration file, containing
// one or more overrides to phantom's default configuration (defined
// above). Its location is determined dynamically at server startup.
var USER_DEFINED_CONFIG_BASENAME = 'config.js';

var CONTENT_TYPE_JSON = 'application/json';
var CONTENT_TYPE_HTML = 'text/html';
var CONTENT_TYPE_PLAINTEXT = 'text/plain';

var Config = {};
function setConfig(c, callback) {

    // Default values are used if missing in user-defined values.
    for (var k in DEFAULT_CONFIG) {
        if (DEFAULT_CONFIG.hasOwnProperty(k)) {
            if (!(k in c)) {
                c[k] = DEFAULT_CONFIG[k];
            }
        }
    }

    console.log("2. Configuration:\n" + util.inspect(c) + "\n");

    // create additional keys
    c['ServerHeader_200']    = {"X-Powered-By": c.X_POWERED_BY, "Server": c.SERVER_NAME };
    c['ServerHeaderCSS_200'] = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/css"};
    c['ServerHeaderJS_200']  = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/javascript"};
    c['ServerHeaderPNG_200'] = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "image/png"};

    // give other functions access
    Config = c;

    callback();
}

// Custom modules
var TotalRecall = require('./TotalRecall');
var cache = new TotalRecall();

// Prevent flooding the server's RAM with potentially malicious POST requests
var MAX_POST_BODY_IN_BYTES = 1048576; // 1 MB

// Detect file type that is being served so mime-type can be correctly
// set. This makes Chrome's debugger happy. :-) <-- chrome
var JS_FILE_RX  = new RegExp('\.js$');
var CSS_FILE_RX = new RegExp('\.css$');
var PNG_FILE_RX = new RegExp('\.png$');

var HOME_DIR_RX = new RegExp('/public/$');

var API_METHOD_RX = new RegExp('^/api/(\\w+)');

var CachedFile = '';

var requestHandlerResponseHeader = {
    "Content-Type": "application/json charset=utf-8",
    "Vary": "Accept-Encoding"
};

//--------------------------------------------------------------------
// Application Functions
//--------------------------------------------------------------------

// @param app object
// @param callback function
// @return void
var App = null;
function setApplication(app, callback) {

    // Sets the application object to App variable, accessable
    // throughout the phantom server.
    App = app;

    // Initializes special class members of the application
    App.Callback = function() {};  // FIXME: is this still necessary?
    App.Methods = {};

    // Create lookup hash for App's apiDelegate function
    for (var m in App) {
        if (typeof App[m] === 'function' && App.hasOwnProperty(m)) {
            App.Methods[m] = true;
        }
    }

    callback();
}

function apiDelegate(method_name, params, callback) {
    if (method_name in App.Methods) {

        // Initialize result
        var result = null;

        // Allow API methods to accept a second optional callback parameter.
        //
        // If the method returns an object it is assigned to result, else the
        // api method invokes the callback(), in which case the callback_result
        // variable is sent in the HTTP response instead of the result variable.
        result = App[method_name].call(App, params, function(callback_result) {

            // FIXME: add XML, Plist
            if (typeof(callback_result) === 'object') {
                Config.ServerHeader_200['Content-Type'] = CONTENT_TYPE_JSON;
                callback_result = JSON.stringify(callback_result);
            } else {
                Config.ServerHeader_200['Content-Type'] = CONTENT_TYPE_PLAINTEXT;
            }

            callback(callback_result);
        });

        if (typeof(result) !== 'undefined') {

            // FIXME: add XML, Plist
            if (typeof(result) === 'object') {
                Config.ServerHeader_200['Content-Type'] = CONTENT_TYPE_JSON;
                result = JSON.stringify(result);
            } else {
                Config.ServerHeader_200['Content-Type'] = CONTENT_TYPE_PLAINTEXT;
            }
   
            callback(result);
        }

    } else { // Error: method does not exist
        callback(JSON.stringify({method: method_name, valid_method: false}));
    }
}

//--------------------------------------------------------------------
// Phantom Server request handler
//--------------------------------------------------------------------
function phantomRequestHandler(request, response) {

    var uri = url.parse(request.url).pathname;
    var filename = Config.DOC_ROOT + uri;

    // Chrome always requests favicon.ico but we will not serve it.
    if (uri === '/favicon.ico') { return false; }

    fs.exists(filename, function(exists) {
        var urlObj = url.parse(request.url, true);

        //--------------------------------------------------------------------
        // Detect API web service request.
        // 
        // The URL's HTTP path can be in any of the following formats:
        // 
        //     /api/method_name
        //     /api/method_name/
        //     /api/method_name?k1=v2&k2=v2
        //     /api/method_name/?k1=v2&k2=v2
        //
        // Parameters can be in the query string (like the above examples) or
        // in the HTTP request body, as in a POST request.
        //--------------------------------------------------------------------
        var api_match;
        if (null !== (api_match = API_METHOD_RX.exec(urlObj.pathname))) {

            var method_name = api_match[1];

            if (request.method === 'GET') {
                var params = urlObj.query;  // if no query string in URL, returns {}
                apiDelegate(method_name, params, function(result) {
                    SendResponse(response, {status_code: 200, headers: Config.ServerHeader_200}, result);
                    return;
                });

            } else { // POST, etc.

                var body = '';
                request.on('data', function(data) {
                    body += data;

                    // catch RAM flood attempts
                    if (body.length > MAX_POST_BODY_IN_BYTES) {
                        SendResponse(response, {status_code: 413, headers: Config.ServerHeader_200},
                            '413 request too large');
                        request.connection.destroy();
                        return;
                    }
                });

                request.on('end', function() {
                    var params = qs.parse(body);
                    apiDelegate(method_name, params, function(result) {
                        SendResponse(response, {status_code: 200, headers: Config.ServerHeader_200}, result);
                        return;
                    });
                });
            }

        //------------------------------------------------------------
        // 404
        //------------------------------------------------------------
        } else if (!exists) { 
            var head = {status_code: 404, headers: {"Content-Type": "text/plain"}};
            var body = '404 resource not found [' + urlObj.path + ']';
            SendResponse(response, head, body);
            return;

        //------------------------------------------------------------
        // Main Application: index.html
        //------------------------------------------------------------
        } else if (HOME_DIR_RX.test(filename)) {

            Config.ServerHeader_200['Content-Type'] = CONTENT_TYPE_HTML;

            // Check if index.html is cached (server-side). If not,
            // put it in the cache.
            if (Config.CACHE_INDEX_FILE && cache.keyExists('MainApp')) {
                console.log('getting index.html from cache');
                CachedFile = cache.get('MainApp');

                 SendResponse(response,
                             {status_code: 200, headers: Config.ServerHeader_200},
                             CachedFile);
                return;

            } else {
                filename += 'index.html'; 
                fs.readFile(filename, "binary", function(err, file) {
                    if (err) {
                        response.writeHead(500, {"Content-Type": "text/plain"});
                        response.write(err + "\n");
                        response.end();
                    } else {
                        if (Config.CACHE_INDEX_FILE) {
                            console.log('putting index.html in cache');
                            cache.put('MainApp', file);
                        }

                        response.writeHead(200, Config.ServerHeader_200);
                        response.write(file, "binary");
                        response.end();
                    }
                });
            } // end if cache.keyExists()

        } else {

            //------------------------------------------------------------
            // HTTP Request for .png, .js, .css etc.
            //------------------------------------------------------------
            fs.readFile(filename, "binary", function(err, file) {

                // 500 Server Error
                if (err) {
                    response.writeHead(500, {"Content-Type": "text/plain"});
                    response.write(err + "\n");
                    response.end();
                    return;
                }

                // Set applicable mime time so Chrome will be happy.
                if (CSS_FILE_RX.test(filename)) {
                    response.writeHead(200, Config.ServerHeaderCSS_200);
                } else if (JS_FILE_RX.test(filename)) {
                    response.writeHead(200, Config.ServerHeaderJS_200);
                } else if (PNG_FILE_RX.test(filename)) {
                    response.writeHead(200, Config.ServerHeaderPNG_200);
                } else {
                    response.writeHead(200, Config.ServerHeader_200);
                }
                response.write(file, "binary");
                response.end();
            });
        }
    });
} // end function phantomRequestHandler()

function SendResponse(res, head, body) {
    res.writeHead(head.status_code, head.headers);
    res.write(body, 'binary');
    res.end();
}

//--------------------------------------------------------------------
// Instantiate the Web Server
//--------------------------------------------------------------------
function instantiate_server() {
    var server = http.createServer(phantomRequestHandler);

    var host_name_msg = '';
    if (Config.HOST === null) {
        server.listen(Config.PORT);
        host_name_msg = 'localhost';
    } else {
        server.listen(Config.PORT, Config.HOST);
        host_name_msg = Config.HOST;
    }

    var log_msg = Config.SERVER_NAME + " started running at";
    log_msg    += " => " + host_name_msg + ":" + Config.PORT.toString();
    console.log('3. ' + log_msg + "\n");
}

function run(app) {

    // Get the directory where the main app.js is. A user-defined
    // "config.js" may exists. If that file exists, access it so we
    // can override phantom's default config settings with the
    // user-defined settings.
    var app_dir = path.dirname(process.mainModule.filename);
    var user_defined_config_full_path = app_dir + '/' + USER_DEFINED_CONFIG_BASENAME;
    var conf = {};

    if (fs.existsSync(user_defined_config_full_path)) {
        conf = require(user_defined_config_full_path).config;
    } else {
        console.log("Warning: phantom is not using any user-defined config settings!\n");
    }

    // Don't start the server until the config has been set.
    function execResponse(error, stdout, stderr) {
        setConfig(conf, function() {
            setApplication(app, function() {
                instantiate_server();
            });
        });
    }

    var exec = require('child_process').exec;
    exec('node -v', execResponse);       
}

// "Note that uncaughtException is a very crude mechanism for exception
//  handling and may be removed in the future."
//
// --Node.js documentation, as of v0.10.12 (http://nodejs.org/api/process.html)
//
// Maybe user can wrap his application with forever npm module instead of this?
process.on('uncaughtException', function(err) {
  var advice = 'Node may be in an unstable state due to ';
  advice    += 'this error. Consider restarting phantom server.';
  console.log('Caught exception: [' + err + "]\n" + advice);
});

exports.run = run;
