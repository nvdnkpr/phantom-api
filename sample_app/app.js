var MyApp = new function() {

    var initialize = function() {
        console.log('1. MyApp initialized');
    };

    // POST request
    //
    // @param params - hash object
    // @return hash object
    this.postFatherOfThor = function(params) {
        var greeting = params.greeting;
        return {name: greeting + ', Odin'};
    };

    // GET request
    //
    // @param params - hash object
    // @param callback - callback function
    // @return hash object via callback
    this.getBrotherOfThor = function(params, callback) {
        var greeting = params.greeting

        // some asynchronous stuff...

        callback({name: greeting + ', Loki'});
    };

    // GET request
    //
    // @param void
    // @return hash object
    this.getSisterOfThor = function() {
        return {name: 'Vera'};
    };

    initialize();
};

// Instantiate phantom object.
//
// Note: Until phantom is in the npm Registry, you may
// need to express the full path to the phantom directory,
// e.g., var phantom = require('/path/to/phantom')
var phantom = require('phantom');

// Run the application with phantom power.
phantom.run(MyApp);

// NOTE: By default, phantom will listen on port 8008 for HTTP
// requests and has /var/www/public set as its doc root.
//
// These are easily changed with a custom config file that is created
// in the same directory as this app.js file. The filename name should
// be "config.js" and would look like the following (taken from the
// sample config.js provided).
// 
// exports.config = {
//    DOC_ROOT: '/full/path/to/application/doc_root',
//    PORT: 5023,
//
//    // The following keys aren't strictly necessary, but may enhance
//    // your server's personalization.
//    HOST: 'my.domain.tld',
//    X_POWERED_BY: 'Omniscient Overlords',
//    SERVER_NAME: 'The Phantom Node.js Server'
//};
