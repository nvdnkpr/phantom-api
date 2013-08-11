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

// Declare and initialize module variables.
var Config, App, defaultStatusCode,
    http = require("http"),
    url  = require("url"),
    qs   = require("querystring"),
    fs   = require("fs"),
    path = require("path"),
    util = require("util"),

    // phantom-api's cache mechanism
    totalRecall = require("./TotalRecall"),

    // If HOST is not overridden in the application's user-defined
    // config.js, then server.list() omits the host argument; the server
    // will then accept connections directed to any IPv4 address
    // (INADDR_ANY)
    defaultConfig = {
              DOC_ROOT: "/var/www/public/",
                  PORT: 8008,
                  HOST: null,
          X_POWERED_BY: "Phantom API, Ltd.",
           SERVER_NAME: "phantom-api Node.js/" + process.version,
      CACHE_INDEX_FILE: false,
          LOG_FILENAME: "/var/www/log/phantom_api.log"
    },

    // This is the name of the user-defined configuration file, containing
    // one or more overrides to phantom-api's default configuration (defined
    // above). Its location is determined dynamically at server startup.
    USER_DEFINED_CONFIG_BASENAME = "config.js",
    CONTENT_TYPE_JSON            = "application/json; charset=utf-8",
    CONTENT_TYPE_HTML            = "text/html; charset=utf-8",
    CONTENT_TYPE_PLAINTEXT       = "text/plain",
    cache = new totalRecall(),

    // Prevent flooding the server's RAM with potentially malicious
    // POST requests
    MAX_POST_BODY_IN_BYTES = 1048576, // 1 MB

    // Detect file type that is being served so mime-type can be correctly
    // set. This makes Chrome's debugger happy. :-) <-- chrome
    JS_FILE_RX  = new RegExp("\\.js$"),
    CSS_FILE_RX = new RegExp("\\.css$"),

    // Thought the following syntax looks clumsier, it is more
    // efficient than the amateurish, case insenstive
    // "i" switch.
    PNG_FILE_RX = new RegExp("\\.[Pp][Nn][Gg]$"),
    JPG_FILE_RX = new RegExp("\\.[Jj][Pp][Ee]?[Gg]$"),
    GIF_FILE_RX = new RegExp("\\.[Gg][Ii][Ff]$"),

    HOME_DIR_RX = new RegExp("/public/$"),

    JSON_CONTENT_TYPE_RX = new RegExp("application/json"),
    JSON_DETECTION_RX = new RegExp("^{"),

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
    API_METHOD_RX = new RegExp("^/api/(?:(v?[0-9.]+)/)?(\\w+)(/\\w+)?"),

    // Node lowercases all keys in the request header object.
    X_HEADER_KEY_RX = new RegExp("^x-"),

    statusCode = {
        OK: 200,
        FORBIDDEN: 403,
        RESOURCE_NOT_FOUND: 404,
        REQUEST_TOO_LARGE: 413,
        SERVER_ERROR: 500
    },

    // These values can be changed from within the App via
    // phantom.setHttpStatusCode() and/or phantom.setHttpResponseHeader()
    // on a per response basis. After the response is sent, the variables
    // are reset to null.
    customHttpStatusCode = null,
    customHttpResponseHeader = null,

    cachedFile = "";
    // end of variable declarations and initializations.

//--------------------------------------------------------------------
// Helper Functions
//--------------------------------------------------------------------

// @param object c
// @pram  function callback
// @callback
function setConfig( c, callback ) {

    // Default values are used if missing in user-defined values.
    for ( var k in defaultConfig ) {
        if ( defaultConfig.hasOwnProperty(k) ) {
            if ( !(k in c) ) {
                c[k] = defaultConfig[k];
            }
        }
    }

    console.log("Configuration:\n" + util.inspect(c) + "\n");

    // create additional keys
    c.ServerHeader    = {"X-Powered-By": c.X_POWERED_BY, "Server": c.SERVER_NAME };
    c.ServerHeaderCSS = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/css"};
    c.ServerHeaderJS  = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "text/javascript"};
    c.ServerHeaderPNG = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "image/png"};
    c.ServerHeaderJPG = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "image/jpeg"};
    c.ServerHeaderGIF = {"X-Powered-By": c.X_POWERED_BY, "Content-Type": "image/gif"};

    // give other functions access
    Config = c;

    callback();
}

// @param  object obj_1
// @param  object target_obj
// @return object
function mergeSimpleObjects( obj_1, target_obj ) {
    var idx, obj1Key,
        obj1Keys = Object.keys( obj_1 );

    for ( idx in obj1Keys ) {
        obj1Key = obj1Keys[idx];
        target_obj[obj1Key] = obj_1[obj1Key];
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
function getRequestXHeaders( req ) {
    var key,
        customHeaders = {},
        reqHeaders    = req.headers,
        headerKeys    = Object.keys(reqHeaders),
        i             = 0,
        len           = headerKeys.length;

    for ( i=0; i<len; ++i ) {
        key = headerKeys[i];
        if ( X_HEADER_KEY_RX.test(key) ) {
            customHeaders[key] = reqHeaders[key];
        }
    }

    return customHeaders;
}

// Merge custom header into default header object.
// 
// Allow custom header keys to override default settings (case
// insensitively).
//
// @param  object header
// @param  function callback
// @return via callback
function mergeCustomHttpResponseHeader( header, callback ) {
    var defaultKeys               = Object.keys( header ),
        customKeys                = Object.keys( customHttpResponseHeader ),
        mergedHeaders             = {},
        defaultKeysMapByLowerCase = {},    
        customKeyLowerCase        = '',
        i                         = 0,
        len_d                     = defaultKeys.length,
        len_c                     = customKeys.length;

    // Create a 'lowercase: uppercase' map to search for duplicate keys
    // case insensitively, e.g.: {"x-approved-by": "X-Approved-By"}
    for ( i=0; i<len_d; ++i ) {
        defaultKeysMapByLowerCase[defaultKeys[i].toLowerCase()] = defaultKeys[i];

        // populate our new merged header object while we're at it.
        mergedHeaders[defaultKeys[i]] = header[defaultKeys[i]];
    }

    // Add custom headers to header object. If there is duplicate key
    // (case insensitively), delete default key and add custom,
    // preserving the case of the custom header key.
    for ( i=0; i<len_c; ++i ) {
        customKeyLowerCase = customKeys[i].toLowerCase();

        // If custom key exists in default header, replace it with the
        // custom setting so we don't have duplicates.
        if ( customKeyLowerCase in defaultKeysMapByLowerCase ) {

            // Prevent duplicates in the header.
            //
            // We only know what the lower case key is, but we can
            // only delete the key from the object with the exact case
            // of the key; it's a good thing we stored that in our
            // previously created map. :)
            delete mergedHeaders[defaultKeysMapByLowerCase[customKeyLowerCase]];
        }

        mergedHeaders[customKeys[i]] = customHttpResponseHeader[customKeys[i]];
    }

    callback( mergedHeaders );
}

// @param  HTTP Response object res
// @param  object head
// @param  string body
// @return void
function sendResponse( res, head, body ) {
    head.headers["Content-Length"] = body.length;

    // phantom.setHttpStatusCode() method had been called by App.
    if ( customHttpStatusCode !== null ) {
        head.status_code = customHttpStatusCode;
        customHttpStatusCode = null;
    }

    if ( customHttpResponseHeader === null ) {
        res.writeHead( head.status_code, head.headers );
        res.write( body, "binary" );
        res.end();
    } else {
        mergeCustomHttpResponseHeader( head.headers, function(mergedHeaders) {
            head.headers = mergedHeaders;
            res.writeHead( head.status_code, head.headers );
            res.write( body, "binary" );
            res.end();
            customHttpResponseHeader = null;
        });
    }
}

//--------------------------------------------------------------------
// Application Functions
//--------------------------------------------------------------------

// @param app object
// @param callback function
// @return void
function setApplication( app, callback ) {

    // Sets the application object to App variable, accessable
    // throughout the phantom-api server.
    App = app;

    // Initializes special class members of the application
    App.Methods = {};

    // Create lookup hash for App's apiDelegate function
    //
    // Method names that begin with '_' are inferred to be private;
    // therefore, those methods will not be included in the App.Methods
    // lookup object and will be considered invalid methods if an
    // attempt in the API is used to call them.
    var firstChar = "";
    for ( var m in App ) {
        firstChar = m[0];
        if ( typeof App[m] === "function" && firstChar !== "_" && App.hasOwnProperty(m) ) {
            App.Methods[m] = true;
        }
    }

    callback();
}

// @param result
// @return result
function processResultAndSetContentType( result ) {

    if ( typeof(result) === "object" ) {
        Config.ServerHeader["Content-Type"] = CONTENT_TYPE_JSON;
        result = JSON.stringify( result );
    } else {
        // If it's a string and first character is '{', it's likely a JSON
        // payload; set content type accordingly.
        if ( typeof(result) === "string" && result[0] === "{" ) {
            Config.ServerHeader["Content-Type"] = CONTENT_TYPE_JSON;
        } else {
            Config.ServerHeader["Content-Type"] = CONTENT_TYPE_PLAINTEXT;
        }
    }

    return result;
}

// HTTP request's content-type is application/json if we're calling
// this function. The JSON payload has already been assigned to the
// params object -- as a key with an empty string value, i.e., it's
// a raw post from the client. This function will parse that out and
// assign it to params._json for the method to access it as a native
// JavaScript object instead of as a JSON string.
//
// @param object params
// @param function callback
// @callback
function extractJSONPayload( params, callback ) {
    var paramKeys = Object.keys( params ),
        len       = paramKeys.length,
        i         = 0;

    try {
        for ( i=0; i<len; ++i ) {
            if ( JSON_DETECTION_RX.test(paramKeys[i]) && params[paramKeys[i]] === "" ) {
                params._json = JSON.parse( paramKeys[i] );
                break;
            }
        }
    } catch (x) {
        params._error = "JSON parse " + x.toString();
    }

    callback( params );
}

// phantom-api magic happens here.
//
// If request's content-type is application/json, the JSON string
// payload is parsed and assigned to params._json to provide access to
// the called method.
//
// @param  object req
// @param  string methodName
// @param  object params
// @param  function callback
// @callback
function apiDelegate( req, methodName, params, callback ) {

    if ( methodName in App.Methods ) {

        // Allow API methods to accept a second optional callback parameter.
        //
        // If the method returns an object it is assigned to result, else the
        // api method invokes the callback(), in which case the callback_result
        // variable is sent in the HTTP response instead of the result variable.

        var result = null;

        // If payload is a string of JSON, than parse it and make the object available in params._json
        if ( "content-type" in req.headers && JSON_CONTENT_TYPE_RX.test(req.headers["content-type"]) ) {
            extractJSONPayload( params, function(params) {
                result = App[methodName].call( App, params, function(callback_result) {
                    callback_result = processResultAndSetContentType( callback_result );
                    callback( callback_result );
                });
            });
        } else {
            result = App[methodName].call( App, params, function(callback_result) {
                callback_result = processResultAndSetContentType( callback_result );
                callback( callback_result );
            });
        }

        if ( typeof(result) !== "undefined" ) {
            result = processResultAndSetContentType( result );
            callback( result );
        }

    } else {
        // Error: method does not exist or is private (begins with "_" character)
        defaultStatusCode = statusCode.FORBIDDEN;
        callback( JSON.stringify({method: methodName, valid_method: false}) );
    }
}


//--------------------------------------------------------------------
// Phantom API Server request handler
//--------------------------------------------------------------------
function phantomRequestHandler( request, response ) {

    // Declare/initialize function's variables.
    var urlObj,
        apiMatch,
        _api_version,
        methodName,
        customHeaders,
        id,
        qs_params,
        params,
        body,
        head,
        serverHeader,
        uri = url.parse( request.url ).pathname,
        filename = Config.DOC_ROOT + uri;

    // The defaultStatusCode value may be reassigned before the HTTP
    // response if circumstances warrant it.
    defaultStatusCode = statusCode.OK;

    // Chrome always requests favicon.ico but we will not serve it.
    if ( uri === "/favicon.ico" ) { return false; }

    fs.exists( filename, function(exists) {
        urlObj = url.parse( request.url, true );

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
        if ( null !== (apiMatch = API_METHOD_RX.exec(urlObj.pathname)) ) {

            // capture optional api version if present (e.g., /api/v1/methodname/)
            _api_version = typeof( apiMatch[1] ) !== "undefined" ? apiMatch[1] : null;

            methodName = apiMatch[2];

            customHeaders = getRequestXHeaders(request);

            // Capture id value if passed in path after method name, e.g.:
            // 
            //     domain.com/api/methodname/23
            // 
            // Include this value as an "id" parameter name
            id = typeof( apiMatch[3] ) !== "undefined" ? apiMatch[3].replace("/", "") : null;

            // Always try to get query string. If a GET request assign
            // to params var. If not a GET merge query string params with
            // the params expressed in the body.
            qs_params = urlObj.query;  // if no query string in URL, returns {}

            if ( request.method === "GET" ) {
                params = qs_params;

                // always include custom request headers in callback result
                params._custom_headers = customHeaders;

                if ( _api_version !== null ) {
                    params._api_version = _api_version;
                }

                if ( id !== null ) {
                    params.id = id;
                }

                apiDelegate( request, methodName, params, function(result) {
                    sendResponse( response, 
                                  {status_code: defaultStatusCode, headers: Config.ServerHeader},
                                  result );
                    return;
                });

            } else {  // POST, PUT, etc.

                body = "";
                request.on( "data", function(data) {
                    body += data;

                    // catch RAM flood attempts
                    if ( body.length > MAX_POST_BODY_IN_BYTES ) {
                        sendResponse( response,
                                      {status_code: statusCode.REQUEST_TOO_LARGE, headers: Config.ServerHeader},
                                      "413 request too large" );
                        request.connection.destroy();
                        return;
                    }
                });

                request.on( "end", function() {
                    params = qs.parse(body);

                    // Merge query string_params (if they exist) with body params.
                    // If a key in the query string matches a key in the body, then
                    // the query string wins. It's up to the developer to not include
                    // the same key in both the body and the query string.
                    if ( Object.keys(qs_params).length > 0 ) {
                        params = mergeSimpleObjects( qs_params, params );
                    }

                    // always include custom request headers in callback result
                    params._custom_headers = customHeaders;

                    if ( _api_version !== null ) {
                        params._api_version = _api_version;
                    }

                    if ( id !== null ) {
                        params.id = id;
                    }

                    apiDelegate( request, methodName, params, function(result) {
                        sendResponse( response,
                                      {status_code: defaultStatusCode, headers: Config.ServerHeader},
                                      result );
                        return;
                    });
                });
            }

        //------------------------------------------------------------
        // 404
        //------------------------------------------------------------
        } else if ( !exists ) { 
            head = {status_code: statusCode.RESOURCE_NOT_FOUND,
                    headers: {"Content-Type": CONTENT_TYPE_PLAINTEXT}};
            body = "404 resource not found [" + urlObj.path + "]";
            sendResponse( response, head, body );
            return;

        //------------------------------------------------------------
        // Main Application: index.html
        //------------------------------------------------------------
        } else if ( HOME_DIR_RX.test(filename) ) {

            Config.ServerHeader["Content-Type"] = CONTENT_TYPE_HTML;

            // Check if index.html is cached (server-side). If not,
            // put it in the cache.
            if ( Config.CACHE_INDEX_FILE && cache.keyExists("MainApp") ) {

                console.log("getting index.html from cache");
                cachedFile = cache.get("MainApp");

                sendResponse( response,
                              {status_code: statusCode.OK, headers: Config.ServerHeader},
                              cachedFile );
                return;

            } else {
                filename += "index.html"; 
                fs.readFile( filename, "binary", function(err, file) {
                    if ( err ) {
                        response.writeHead( statusCode.SERVER_ERROR, {"Content-Type": "text/plain"} );
                        response.write( err + "\n" );
                        response.end();
                    } else {
                        if ( Config.CACHE_INDEX_FILE ) {
                            console.log("putting index.html in cache");
                            cache.put( "MainApp", file );
                        }

                        sendResponse( response,
                                      {status_code: statusCode.OK, headers: Config.ServerHeader},
                                      file );
                    }

                    return;
                });
            } // end if cache.keyExists()

        } else {

            //------------------------------------------------------------
            // HTTP Request for .png, .js, .css etc.
            //------------------------------------------------------------
            fs.readFile( filename, "binary", function(err, file) {

                // 500 Server Error
                if ( err ) {
                    response.writeHead( statusCode.SERVER_ERROR, {"Content-Type": "text/plain"} );
                    response.write( err + "\n" );
                    response.end();
                    return;
                }

                // Set applicable mime time so Chrome will be happy.
                serverHeader = {};
                if ( CSS_FILE_RX.test(filename) ) {
                    serverHeader = Config.ServerHeaderCSS;
                } else if ( JS_FILE_RX.test(filename) ) {
                    serverHeader = Config.ServerHeaderJS;
                } else if ( PNG_FILE_RX.test(filename) ) {
                    serverHeader = Config.ServerHeaderPNG;
                } else if ( JPG_FILE_RX.test(filename) ) {
                    serverHeader = Config.ServerHeaderJPG;
                } else if ( GIF_FILE_RX.test(filename) ) {
                    serverHeader = Config.ServerHeaderGIF;
                } else {
                    serverHeader = Config.ServerHeader;
                }

                response.writeHead( statusCode.OK, serverHeader );
                response.write( file, "binary" );
                response.end();
            });
        }
    });
} // end function phantomRequestHandler()


//--------------------------------------------------------------------
// Instantiate the Web Server
//--------------------------------------------------------------------
function instantiateServer() {
    var server = http.createServer( phantomRequestHandler );

    var host_name_msg = "";
    if ( Config.HOST === null ) {
        server.listen( Config.PORT );
        host_name_msg = "localhost";
    } else {
        server.listen( Config.PORT, Config.HOST );
        host_name_msg = Config.HOST;
    }

    var log_msg = Config.SERVER_NAME + " started running at";
    log_msg    += " => " + host_name_msg + ":" + Config.PORT.toString();
    console.log(log_msg + "\n");
}

function run( app ) {

    // Get the directory where the main app.js is. A user-defined
    // "config.js" may exists. If that file exists, access it so we
    // can override phantom's default config settings with the
    // user-defined settings.
    var app_dir = path.dirname( process.mainModule.filename );
    var user_defined_config_full_path = app_dir + "/" + USER_DEFINED_CONFIG_BASENAME;
    var conf = {};

    if ( fs.existsSync(user_defined_config_full_path) ) {
        conf = require( user_defined_config_full_path ).config;
    } else {
        var config_msg = "\nWARNING: phantom-api cannot find the config.js file; using default settings.\n";
        config_msg    += "         Copy sample_app/config.js to the same directory as your app.js.\n";
        config_msg    += "         Edit file to match your environment and then restart phantom-api.\n";
        console.log( config_msg );
    }

    // Don't start the server until the config has been set.
    function execResponse( error, stdout, stderr ) {
        setConfig( conf, function() {
            setApplication( app, function() {
                instantiateServer();
            });
        });
    }

    var exec = require("child_process").exec;
    exec( "node -v", execResponse );       
}

// "Note that uncaughtException is a very crude mechanism for exception
//  handling and may be removed in the future."
//
// --Node.js documentation, as of v0.10.12 (http://nodejs.org/api/process.html)
//
// Maybe user can wrap his application with forever npm module instead of this?
process.on( "uncaughtException", function(err) {
    var advice = "Node may be in an unstable state due to ";
    advice    += "this error. Consider restarting your phantom-api application.";
    console.log( "Caught exception: [" + err + "]\n" + advice );
});


//--------------------------------------------------------------------
// Phantom Hook(er)s
// 
// The following methods are exposed to the application
//--------------------------------------------------------------------
function setHttpStatusCode( status_code ) {
    customHttpStatusCode = status_code;
}

function setHttpResponseHeader( header ) {
    customHttpResponseHeader = header;
}

exports.run = run;
exports.setHttpStatusCode = setHttpStatusCode;
exports.setHttpResponseHeader = setHttpResponseHeader;