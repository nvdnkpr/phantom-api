/* Sample config.js
 * 
 * This file should be in the same directory as your application
 * (app.js).
 * 
 * Only override keys that you want. Minimally, this would be DOC_ROOT
 * and PORT.
*/

exports.config = {

    // This is the directory from where index.html would be served
    // (and other, static files: image, js, and css). Examples:
    // 
    //     http://localhost:5023/
    //     http://localhost:5023/login.html
    // 
    // The DOC_ROOT directory is irrelevant with API-based URLs, e.g.:
    //
    //     http://localhost:5023/api/methodname/?k1=v1&k2=v2
    DOC_ROOT: '/var/www/phantom-app/public',
    PORT: 5023,

    // The following keys aren't strictly necessary, but may enhance
    // your server's personalization.

    // If HOST is left null, then any reachable domain at the defined
    // port will access the phantom-api server, e.g., http://localhost:5023.
    // Define a host to restrict access to the defined host name, e.g.,
    // HOST: 'my.domain.tld'
    HOST: null,

    X_POWERED_BY: 'Omniscient Overlords, LLC',

    SERVER_NAME: 'Phantom API Node.js Server',

    // When set to false, every request will cause the index.html
    // file to be served from disk. If set to true, the index.html
    // file will be stored in the server's memory and subsequently
    // served from there instead from disk.
    CACHE_INDEX_FILE: false
};
