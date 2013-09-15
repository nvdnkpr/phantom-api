var phantom = require("phantom-api");

var MyClass = function() {

    // This is a private method because its name begins with "_"
    this._initialize = function() {
        console.log("\nMyApp initialized.\n");
        this.brother = "Loki";
    };

    // GET request
    //
    // @param params - hash object
    // @param callback - callback function
    // @return hash object via callback
    this.getBrotherOfThor = function( params, callback ) {
        var greeting = params.greeting;

        // some asynchronous stuff...

        // Set custom HTTP Response header (optional)
        var header = {"X-Approved-By": "Johannes Ockeghem"};
        phantom.setHttpResponseHeader( header );

        callback( {name: greeting + ", " + this.brother} );
    };

    // GET request
    //
    // @param void
    // @return hash object
    this.getSisterOfThor = function() {
        return {name: "Vera"};
    };

    // POST request
    //
    // @param params - hash object
    // @return hash object via callback
    this.postFatherOfThor = function( params, callback ) {
        var father = parseInt( params.id, 10 ) === 46 ? "Odin" : "unknown";
        var result = {father: father, request_params: params};

        // Override phantom's default status code setting.
        if ( father === "unknown" ) {
            phantom.setHttpStatusCode(500);
        }

        callback( result );
    };

    this._initialize();
};

phantom.run( MyClass );

// When your application grows, individual files are created to avoid
// a monolithic, unmaintainable code base.
//
// How does phantom know about multiple modules? The run() method also
// accepts an array of functions/objects:
//
//     var MyClass_1 = require("./lib/MyClass_1").MyClass_1,
//         MyClass_2 = require("./lib/MyClass_2").MyClass_2,
//         MyClass_3 = require("./lib/MyClass_3").MyClass_3;
//
//     phantom.run( [MyClass_1, MyClass_2, MyClass_3] );
//
// phantom will aggregate all of the public API methods from the
// combined objects. Duplicate method names aren't allowed.

// NOTE: By default, phantom-api listens on port 5023.
//
// These are easily changed with a custom config file that is created
// in the same directory as this app.js file. The filename name should
// be "config.js" and would look like the following (similar to the
// sample config.js provided).
// 
// exports.config = {
//    DOC_ROOT: '/var/www/phantom-api/public',
//    PORT: 5023,
//
//    // The following keys aren't strictly necessary, but may enhance
//    // your server's personalization. Leave HOST: null to be able to
//    // access http://localhost:5023
//    HOST: 'my.domain.tld',
//    X_POWERED_BY: 'Omniscient Overlords, LLC',
//    SERVER_NAME: 'Phantom API Node.js Server'
//};
