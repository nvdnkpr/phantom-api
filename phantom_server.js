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
    fs   = require("fs");

var DEFAULT_CONFIG = {
        DOC_ROOT: "/var/www/public/",
            PORT: 80,
    X_POWERED_BY: "Phantom Frameworks, Ltd.",
     SERVER_NAME: "Phantom Node.js/" + process.version,
    LOG_FILENAME: "/var/www/log/phantom_server.log"
};

var Config = {};
function setConfig(c, callback) {

    // Default values are used if missing in user-defined values.
    for (var k in DEFAULT_CONFIG) {
        if (!(k in c)) {
            c[k] = DEFAULT_CONFIG[k];
        }
    }

    console.log('2. setting up config: %j', c);

    // create additional keys
    c['ServerHeader_200']    = {"X-Powered-By": c.X_POWERED_BY, "Server": c.SERVER_NAME };
    c['ServerHeaderCSS_200'] = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/css"};
    c['ServerHeaderJS_200']  = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/javascript"};

    // give other functions access
    Config = c;

    callback();
}

// Custom modules
var TotalRecall = require('./TotalRecall');
var cache = new TotalRecall();

// Detect file type that is being served so mime-type can be correctly
// set. This makes Chrome's debugger happy.
var JS_FILE_RX  = new RegExp('\.js$');
var CSS_FILE_RX = new RegExp('\.css$');

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

// FIXME set applicable HTTP status code for each type of response.
function apiDelegate(method_name, params, callback) {
    if (method_name in App.Methods) {
        var result = App[method_name].call(App, params);
        callback(result);
    } else {
        callback({method: method_name, valid_method: false});
    }
}

//--------------------------------------------------------------------
// Phantom Server request handler
//--------------------------------------------------------------------
function requestHandler(request, response) {

    var uri = url.parse(request.url).pathname;
    var filename = Config.DOC_ROOT + uri;

    // Chrome always requests favicon.ico but we will not serve it.
    if (uri === '/favicon.ico') { return false; }

    fs.exists(filename, function(exists) {
        var urlObj = url.parse(request.url, true);

        //------------------------------------------------------------
        // Detect API web service request.
        // 
        // The URL's HTTP path can be in any of the following formats:
        // 
        //     /api/method_name
        //     /api/method_name/
        //     /api/method_name?k1=v2&k2=v2
        //     /api/method_name/?k1=v2&k2=v2
        //
        //------------------------------------------------------------
        var api_match;
        if (null !== (api_match = API_METHOD_RX.exec(urlObj.pathname))) {

            var params = urlObj.query;  // if no query string in URL, then returns {}
            var method_name = api_match[1];

            apiDelegate(method_name, params, function(result) {
                SendResponse(response,
                             {status_code: 200, headers: Config.ServerHeader_200},
                             JSON.stringify(result));
                             return;
            });

            return;

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

            // Check if index.html is cached (server-side). If not,
            // put it in the cache.

            if (cache.keyExists('MainApp')) {
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
                        console.log('putting index.html in cache');
                        cache.put('MainApp', file);
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
                } else {
                    response.writeHead(200, Config.ServerHeader_200);
                }
                response.write(file, "binary");
                response.end();
            });
        }
    });
} // end function requestHandler()


function SendResponse(res, head, body) {
    res.writeHead(head.status_code, head.headers);
    res.write(body, 'binary');
    res.end();
}

//--------------------------------------------------------------------
// Instantiate the Web Server
//--------------------------------------------------------------------
function instantiate_server() {
    var server = http.createServer(requestHandler);
    server.listen(Config.PORT);

    var log_msg = Config.SERVER_NAME + " started running at";
    log_msg    += " => localhost:" + Config.PORT.toString();
    console.log('3. ' + log_msg);
}

function start(conf, app) {

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

exports.start = start;
