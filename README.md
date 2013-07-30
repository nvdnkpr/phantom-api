phantom-api
===========

A flexible, simple, and powerful web framework that disappears to
allow you to focus on the application, not the framework.

Until more documentation is included in this place, refer to
sample_app/app.js comments.

run application
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

If a method does not exist or it exists but its name begins with "_"
(private method), it is not accessible via the API.

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
