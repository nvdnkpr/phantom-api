phantom-api
===========

phantom-api is a flexible, simple, and powerful web framework that
disappears to allow you to focus on the application, not the
framework.

Refer to sample_app/app.js for additional insights and explanations of
how one might approach phantom-api for web service application
development.

install and run
---------------

1. $ npm install phantom-api

2. $ cd node_modules/phantom-api/sample_app/

3. $ node app.js

phantom-api should now be running. Open another terminal and test the
API using the following curl examples.

example api requests
--------------------

The following simple request calls an API public interface (curl's -i
switch displays HTTP response header along with the body):

    $ curl -i "http://localhost:5023/api/getBrotherOfThor/?greeting=Hi"

Try calling a private method:

    $ curl -i "http://localhost:5023/api/_initialize/"

If a method expressed in the URL does not exist in your application or
it exists but its name begins with "_" (private method), it is not
accessible via the API.

The following example demonstrates the powerful, flexible, and simple
phantom-api.

This sample API request includes:

 - api version
 - custom header
 - id in the HTTP path
 - x parameter in POST data
 - y parameter in query string

In order to easily see what data the server application has access to,
the JSON response includes the "params" object, which was received as
the first parameter to the server method. Again, please view
sample_app/app.js for application details.

    $ curl -d "x=1" -H "X-Approved-By: Hit Girl" "http://localhost:5023/api/v2.0/postFatherOfThor/46/?y=2"

sending JSON payload requests
-----------------------------

If the client makes a request which sends a JSON string as its payload
to an API method, phantom-api provides access to the parsed JSON
object via params._json. Example curl request:

    $ curl -X POST -H "Content-Type: application/json" -d \
        '{"cities":["Seoul","Shanghai","Taipei"]}' \
        http://localhost:5023/api/postFatherOfThor/46

And then the method gets the array of cities thusly:

    this.postFatherOfThor = function( params, callback ) {
        var cities = params._json["cities"];
    }

If the JSON string is malformed and fails to parse, then the error is
available to the method via params._error.

custom features
---------------

 - phantom.setHttpStatusCode()
 - phantom.setHttpResponseHeader()

phantom-api automatically takes care of setting HTTP response headers,
status codes, etc. so you, as a developer, don't have to worry about
such things.

However, there may be cases when the logic of your application
requires that you override phantom-api's behavior.

Before your application returns its response (via return or callback()
method), you can manually override the default HTTP status code in the
response. Example code snippet in your method:

    if ( something unexpectedly bad happens ) {
        phantom.setHttpStatusCode(500);
    }

    callback( result );

Do you need to set some custom HTTP headers in a particular response?

It's intuitive and easy! Example code snippet in your method:

    if ( we need to send HTML instead of JSON ) {
        phantom.setHttpResponseHeader( {"Content-Type": "text/html; charset=utf-8"} );
    }

    callback( htmlResult );

phantom-api will revert to its default HTTP header behavior for API
methods that do not call this method.

If you set a custom response header with a key that already exists in
phantom's default header, your custom key will override phantom's
default setting.

Duplicate key evaluation is performed case insensitively; if your
custom key name is "Content-type" and phantom's is spelled
"Content-Type" then the duplicate key will be found and your custom
setting will replace it, preserving the case of your custom key.

Have fun!
