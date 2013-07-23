/****************************************************************************
* Phantom API Server
*
* This Node.js based HTTP server provides the following built-in
* capabilities:
*
*     - serves static files (ending in .html)
*     - serves static CSS, JavaScript, and image files
*     - integrated API for RESTful web services
* 
* Phantom API's design philosophy is to provide a flexible, ready-to-go
* web framework with extremely simple setup requirments. It's fun!
* 
* Documentation:
* 
*     http://github.com/gold/phantom-api
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

// phantom-api's cache mechanism
var TotalRecall = require('./TotalRecall');

// If HOST is not overridden in the application's user-defined
// config.js, then server.list() omits the host argument; the server
// will then accept connections directed to any IPv4 address
// (INADDR_ANY)
var DEFAULT_CONFIG = {
          DOC_ROOT: "/var/www/public/",
              PORT: 8008,
              HOST: null,
      X_POWERED_BY: "Phantom API, Ltd.",
       SERVER_NAME: "phantom-api Node.js/" + process.version,
  CACHE_INDEX_FILE: false,
      LOG_FILENAME: "/var/www/log/phantom_api.log"
};

// This is the name of the user-defined configuration file, containing
// one or more overrides to phantom-api's default configuration (defined
// above). Its location is determined dynamically at server startup.
var USER_DEFINED_CONFIG_BASENAME = 'config.js';

var CONTENT_TYPE_JSON = 'application/json';
var CONTENT_TYPE_HTML = 'text/html';
var CONTENT_TYPE_PLAINTEXT = 'text/plain';

// This is set in SetConfig()
var Config = {};

// This is set in SetApplication()
var App = null;

var cache = new TotalRecall();

// Prevent flooding the server's RAM with potentially malicious POST requests
var MAX_POST_BODY_IN_BYTES = 1048576; // 1 MB

// Detect file type that is being served so mime-type can be correctly
// set. This makes Chrome's debugger happy. :-) <-- chrome
var JS_FILE_RX  = new RegExp('\.js$');
var CSS_FILE_RX = new RegExp('\.css$');
var PNG_FILE_RX = new RegExp('\.png$');

var HOME_DIR_RX = new RegExp('/public/$');

// The following regex allows optional api version to be expressed as
// well as optional id value in the HTTP path instead of the query
// string, as is expected in RESTful URI patterns.
//
// API version can be expressed with digits and dots, with an optional 'v'
// character prefix. Examples include:
//
//    /api/1.1/methodname  (like twitter)
//    /api/1/methodname
//    /api/v2/methodname
var API_METHOD_RX = new RegExp('^/api/(?:(v?[0-9.]+)/)?(\\w+)(/\\w+)?');

// node lowercases all keys in the request header object.
var X_HEADER_KEY_RX = new RegExp('^x-');

var StatusCode = {
    OK: 200,
    FORBIDDEN: 403,
    RESOURCE_NOT_FOUND: 404,
    REQUEST_TOO_LARGE: 413,
    SERVER_ERROR: 500
};

var DefaultStatusCode;

var CachedFile = '';

//--------------------------------------------------------------------
// Helper Functions
//--------------------------------------------------------------------

// @param object c
// @pram  function callback
// @callback
function SetConfig(c, callback) {

    // Default values are used if missing in user-defined values.
    for (var k in DEFAULT_CONFIG) {
        if (DEFAULT_CONFIG.hasOwnProperty(k)) {
            if (!(k in c)) {
                c[k] = DEFAULT_CONFIG[k];
            }
        }
    }

    console.log("Configuration:\n" + util.inspect(c) + "\n");

    // create additional keys
    c['ServerHeader']    = {"X-Powered-By": c.X_POWERED_BY, "Server": c.SERVER_NAME };
    c['ServerHeaderCSS'] = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/css"};
    c['ServerHeaderJS']  = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/javascript"};
    c['ServerHeaderPNG'] = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "image/png"};

    // give other functions access
    Config = c;

    callback();
}

// @param  object obj_1
// @param  object target_obj
// @return object
function MergeSimpleObjects(obj_1, target_obj) {

    var obj1_keys = Object.keys(obj_1);
    var obj1_key = '';
    for (idx in obj1_keys) {
        obj1_key = obj1_keys[idx];
        target_obj[obj1_key] = obj_1[obj1_key];
    }

    return target_obj;
}

// Return custom headers to application method's first parameter. The
// key name is:
//
//     _custom_headers
//
// @param req http request object
// @return object of custom x- headers
function GetRequestXHeaders(req) {
    var custom_headers = {};
    var req_headers = req.headers;
    var header_keys = Object.keys(req_headers);
    var key = '';
    for (var i=0, len=header_keys.length; i<len; ++i) {
        key = header_keys[i];
        if (X_HEADER_KEY_RX.test(key)) {
            custom_headers[key] = req_headers[key];
        }
    }
    return custom_headers;
}

// @param  HTTP Response object res
// @param  object head
// @param  object string
// @return void
function SendResponse(res, head, body) {
    res.writeHead(head.status_code, head.headers);
    res.write(body, 'binary');
    res.end();
}

//--------------------------------------------------------------------
// Application Functions
//--------------------------------------------------------------------

// @param app object
// @param callback function
// @return void
function SetApplication(app, callback) {

    // Sets the application object to App variable, accessable
    // throughout the phantom-api server.
    App = app;

    // Initializes special class members of the application
    App.Methods = {};

    // Create lookup hash for App's ApiDelegate function
    //
    // Method names that begin with '_' are inferred to be private;
    // therefore, those methods will not be included in the App.Methods
    // lookup object and will be considered invalid methods if an
    // attempt in the API is used to call them.
    var first_char = '';
    for (var m in App) {
        first_char = m[0];
        if (typeof App[m] === 'function' && first_char !== '_' && App.hasOwnProperty(m)) {
            App.Methods[m] = true;
        }
    }

    callback();
}

// @param  string method_name
// @param  object params
// @param  function callback
// @callback
function ApiDelegate(method_name, params, callback) {
    if (method_name in App.Methods) {

        // Initialize result
        var result = null;

        // Allow API methods to accept a second optional callback parameter.
        //
        // If the method returns an object it is assigned to result, else the
        // api method invokes the callback(), in which case the callback_result
        // variable is sent in the HTTP response instead of the result variable.
        result = App[method_name].call(App, params, function(callback_result) {

            if (typeof(callback_result) === 'object') {
                Config.ServerHeader['Content-Type'] = CONTENT_TYPE_JSON;
                callback_result = JSON.stringify(callback_result);
            } else {
                Config.ServerHeader['Content-Type'] = CONTENT_TYPE_PLAINTEXT;
            }

            callback(callback_result);
        });

        if (typeof(result) !== 'undefined') {

            if (typeof(result) === 'object') {
                Config.ServerHeader['Content-Type'] = CONTENT_TYPE_JSON;
                result = JSON.stringify(result);
            } else {
                Config.ServerHeader['Content-Type'] = CONTENT_TYPE_PLAINTEXT;
            }

            callback(result);
        }

    } else {
        // Error: method does not exist or is private (begins with "_" character)
        DefaultStatusCode = StatusCode.FORBIDDEN;
        callback(JSON.stringify({method: method_name, valid_method: false}));
    }
}


//--------------------------------------------------------------------
// Phantom API Server request handler
//--------------------------------------------------------------------
function PhantomRequestHandler(request, response) {

    // The DefaultStatusCode value may be reassigned before the HTTP
    // response if circumstances warrant it.
    DefaultStatusCode = StatusCode.OK;

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
        //     /api/method_name/id
        //     /api/method_name?k1=v2&k2=v2
        //     /api/method_name/?k1=v2&k2=v2
        //
        // The params object, which is the first argument to each API
        // method, will automaticlly include an "id" key if it is
        // expressed directly after the method name, like in the
        // example above (e.g., /api/method_name/23
        // 
        // Optional api version can be included in the path, e.g.:
        // 
        //     /api/v1/method_name/
        // 
        // When an api version number is expressed in the URI, "_api_version"
        // key is automatically included in the params object, available as
        // the first parameter in each method.
        // 
        // Parameters can be in the query string (like the above examples) or
        // in the HTTP request body, as in a POST request.
        //--------------------------------------------------------------------
        var api_match;
        if (null !== (api_match = API_METHOD_RX.exec(urlObj.pathname))) {

            // capture optional api version if present (e.g., /api/v1/methodname/)
            var _api_version = typeof(api_match[1]) !== 'undefined' ? api_match[1] : null;

            var method_name = api_match[2];

            var custom_headers = GetRequestXHeaders(request);

            // Capture id value if passed in path after method name, e.g.:
            // 
            //     domain.com/api/methodname/23
            // 
            // Include this value as an "id" parameter name
            var id = typeof(api_match[3]) !== 'undefined' ? api_match[3].replace('/', '') : null;

            // Always try to get query string. If a GET request assign
            // to params var. If not a GET merge query string params with
            // the params expressed in the body.
            var qs_params = urlObj.query;  // if no query string in URL, returns {}

            if (request.method === 'GET') {
                var params = qs_params;

                // always include custom request headers in callback result
                params._custom_headers = custom_headers;

                if (_api_version !== null) {
                    params._api_version = _api_version;
                }

                if (id !== null) {
                    params.id = id;
                }

                ApiDelegate(method_name, params, function(result) {
                    SendResponse(response, 
                                 {status_code: DefaultStatusCode,
                                  headers: Config.ServerHeader},
                                 result);
                    return;
                });

            } else { // POST, etc.

                var body = '';
                request.on('data', function(data) {
                    body += data;

                    // catch RAM flood attempts
                    if (body.length > MAX_POST_BODY_IN_BYTES) {
                        SendResponse(response,
                                     {status_code: StatusCode.REQUEST_TOO_LARGE,
                                      headers: Config.ServerHeader},
                                     '413 request too large');
                        request.connection.destroy();
                        return;
                    }
                });

                request.on('end', function() {
                    var params = qs.parse(body);

                    // Merge query string_params (if they exist) with body params.
                    // If a key in the query string matches a key in the body, then
                    // the query string wins. It's up to the developer to not include
                    // the same key in both the body and the query string.
                    if (Object.keys(qs_params).length > 0) {
                        params = MergeSimpleObjects(qs_params, params);
                    }

                    // always include custom request headers in callback result
                    params._custom_headers = custom_headers;

                    if (_api_version !== null) {
                        params._api_version = _api_version;
                    }

                    if (id !== null) {
                        params.id = id;
                    }

                    ApiDelegate(method_name, params, function(result) {
                        SendResponse(response,
                                     {status_code: DefaultStatusCode,
                                      headers: Config.ServerHeader},
                                     result);
                        return;
                    });
                });
            }

        //------------------------------------------------------------
        // 404
        //------------------------------------------------------------
        } else if (!exists) { 
            var head = {status_code: StatusCode.RESOURCE_NOT_FOUND,
                        headers: {"Content-Type": CONTENT_TYPE_PLAINTEXT}};
            var body = '404 resource not found [' + urlObj.path + ']';
            SendResponse(response, head, body);
            return;

        //------------------------------------------------------------
        // Main Application: index.html
        //------------------------------------------------------------
        } else if (HOME_DIR_RX.test(filename)) {

            Config.ServerHeader['Content-Type'] = CONTENT_TYPE_HTML;

            // Check if index.html is cached (server-side). If not,
            // put it in the cache.
            if (Config.CACHE_INDEX_FILE && cache.keyExists('MainApp')) {
                console.log('getting index.html from cache');
                CachedFile = cache.get('MainApp');

                 SendResponse(response,
                             {status_code: StatusCode.OK,
                              headers: Config.ServerHeader},
                             CachedFile);
                return;

            } else {
                filename += 'index.html'; 
                fs.readFile(filename, "binary", function(err, file) {
                    if (err) {
                        response.writeHead(StatusCode.SERVER_ERROR,
                                           {"Content-Type": "text/plain"});
                        response.write(err + "\n");
                        response.end();
                    } else {
                        if (Config.CACHE_INDEX_FILE) {
                            console.log('putting index.html in cache');
                            cache.put('MainApp', file);
                        }

                        response.writeHead(StatusCode.OK, Config.ServerHeader);
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
                    response.writeHead(StatusCode.SERVER_ERROR,
                                       {"Content-Type": "text/plain"});
                    response.write(err + "\n");
                    response.end();
                    return;
                }

                // Set applicable mime time so Chrome will be happy.
                var server_header = {};
                if (CSS_FILE_RX.test(filename)) {
                    server_header = Config.ServerHeaderCSS;
                } else if (JS_FILE_RX.test(filename)) {
                    server_header = Config.ServerHeaderJS;
                } else if (PNG_FILE_RX.test(filename)) {
                    server_header = Config.ServerHeaderPNG;
                } else {
                    server_header = Config.ServerHeader;
                }

                response.writeHead(StatusCode.OK, server_header);
                response.write(file, "binary");
                response.end();
            });
        }
    });
} // end function PhantomRequestHandler()


//--------------------------------------------------------------------
// Instantiate the Web Server
//--------------------------------------------------------------------
function InstantiateServer() {
    var server = http.createServer(PhantomRequestHandler);

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
    console.log(log_msg + "\n");
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
        var config_msg = "\nWARNING: phantom-api cannot find the config.js file; using default settings.\n";
        config_msg    += "         Copy sample_app/config.js to the same directory as your app.js.\n";
        config_msg    += "         Edit file to match your environment and then restart phantom-api.\n";
        console.log(config_msg);
    }

    // Don't start the server until the config has been set.
    function ExecResponse(error, stdout, stderr) {
        SetConfig(conf, function() {
            SetApplication(app, function() {
                InstantiateServer();
            });
        });
    }

    var exec = require('child_process').exec;
    exec('node -v', ExecResponse);       
}

// "Note that uncaughtException is a very crude mechanism for exception
//  handling and may be removed in the future."
//
// --Node.js documentation, as of v0.10.12 (http://nodejs.org/api/process.html)
//
// Maybe user can wrap his application with forever npm module instead of this?
process.on('uncaughtException', function(err)
{
    var advice = 'Node may be in an unstable state due to ';
    advice    += 'this error. Consider restarting your phantom-api application.';
    console.log('Caught exception: [' + err + "]\n" + advice);
});

exports.run = run;
