var MyApp = new function() {

    var initialize = function() {
        console.log('1. Application initialized');
    };

    this.postFatherOfThor = function() {
        return {name: 'Odin'};
    };

    this.getBrotherOfThor = function() {
        return {name: 'Loki'};
    };

    this.getSisterOfThor = function() {
        return {name: 'Vera'};
    };

    initialize();
};

// Instantiate phantom object.
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
