/* Sample config.js
 * 
 * In your own app's config.js file, you are encouraged to hard-code
 * the DOC_ROOT value instead of reyling on the dynamic approach used
 * in this sample config.js file.
 */

// TODO: modify header mapping here and in phantom server for more
// flexibility.
exports.config = {
         DOC_ROOT: process.cwd() + '/public',
             PORT: 5023,
     X_POWERED_BY: "gold/jezzadebate",
      SERVER_NAME: "phantom Node.js/" + process.version
};
