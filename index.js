/*
Zy
A small and fast NodeJS routing and presentation web framework.
Version 0.3

Copyright (C) 2013 Danny Allen <me@dannya.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// initialize internal Zy namespace
var Zy = {};


// alias console debug
var d = function (value, type) {
    var prepend = '';

    if (typeof type == 'string') {
        if (type === 'w') {
            // warn
            prepend = '!! ';

        } else if (type === 'i') {
            // info
            prepend = '() ';
        }
    }

    // output
    if ((typeof value == 'string') || (typeof value == 'number')) {
        return console.log(prepend + value);

    } else {
        console.log(prepend);
        console.log(value);

        return true;
    }
};


// import Zy requirements
Zy.lib = {
    http:           require('http'),
    url:            require('url'),
    fs:             require('fs'),
    path:           require('path'),
    async:          require('async'),
    template:       require('nunjucks'),
    mongoclient:    require('mongodb').MongoClient
};


// initialise default config
// Note: you shouldn't need to change these values, instead override them in the config object passed into Zy.start()
Zy.config = {
    port:       8000,

    location: {
        original: {
            style:      '/css/',
            script:     '/js/',
            images:     '/img/',
            templates:  '/templates/'
        },

        minified: {
            style:      '/css/min/',
            script:     '/js/min/',
            images:     '/img/',
            templates:  '/templates/min/'
        }
    },

    routes: {
        'GET': {
            '/': function () {
                return 'Welcome to Zy!';
            },

            403: function () {
                return '403';
            },
            404: function () {
                return '404';
            },
            500: function () {
                return '500';
            }
        },

        'POST': function () {
            return 'Welcome to Zy! (POST)';
        }
    },

    contentType: {
        '.css':     'text/css',
        '.js':      'text/javascript',
        '.txt':     'text/plain'
    }
};


// define environment variables
Zy.env = {
    live: (typeof process.env.HOME != 'undefined'),
    root: (typeof process.env.HOME != 'undefined') ? process.env.HOME : ''
};


// define utility functions
Zy.util = {
    merge: function (obj1, obj2) {
        for (var k in obj2) {
            try {
                if (typeof obj2[k] === 'object') {
                    obj1[k] = Zy.util.merge(obj1[k], obj2[k]);

                } else {
                    obj1[k] = obj2[k];

                }

            } catch (e) {
                obj1[k] = obj2[k];
            }
        }

        return obj1;
    }
};


// define routing functionality
Zy.routing = {
    get: function (id) {
        return Zy.config.routes['GET'][id] || Zy.config.routes['GET'][404] || Zy.config.routes['GET']['/'];
    },

    post: function (id) {
        return Zy.config.routes['POST'][id] || Zy.config.routes['POST']['/'];
    }
};


// define location functionality
Zy.location = {
    FILE:       1,
    DIRECTORY:  2,

    type: function (string) {
        return (string.indexOf('.') === -1) ?
            Zy.location.DIRECTORY :
            Zy.location.FILE;
    },

    path: function (path) {
        var path = path.split('/');
        path.pop();

        return path.join('/');
    },

    filepath: function (filepath) {
        if (!Zy.env.live) {
            // testing
            if (filepath[0] === '/') {
                filepath = filepath.substring(1);
            }

            return filepath;

        } else {
            // live
            return Zy.env.root + filepath;
        }
    },

    // wrap external url.parse to make it more appropriate for our needs
    parse: function (url, bool) {
        var parts = Zy.lib.url.parse(url, bool);

        // ensure directory pathname always ends in a slash, for ease of comparison
        if ((parts.pathname[parts.pathname.length - 1] !== '/') && (Zy.location.type(parts.pathname) === Zy.location.DIRECTORY)) {
            parts.pathname += '/';
        }

        return parts;
    }
};


// define output functionality
Zy.output = {
    FILE:       1,
    TEMPLATE:   2,
    FUNCTION:   3,
    OBJECT:     4,

    type: function (output) {
        if (typeof output === 'string') {
            if (output.indexOf('.tpl') !== -1) {
                return Zy.output.TEMPLATE;

            } else {
                return Zy.output.FILE;
            }

        } else if (typeof output === 'object') {
            return Zy.output.OBJECT;

        } else if (typeof output === 'function') {
            return Zy.output.FUNCTION;
        }
    },

    load: function (response, output, params) {
        // process output data structure?
        var data,
            filename = output;

        if (typeof output === 'object') {
            if (typeof output.length === 'number') {
                // array
                filename    = output[0],
                data        = output[1];

            } else {
                // object
                filename    = output.filename,
                data        = output.data;
            }
        }


        // send minified file?
        if (Zy.env.live &&
            (filename.indexOf('.html') !== -1) &&
            (filename.indexOf(Zy.config.location.minified.templates) === -1)) {

            // set location of minified file
            var minified = filename.replace(
                Zy.config.location.original.templates,
                Zy.config.location.minified.templates
            );

            // process minified output
            Zy.output._output(response, Zy.location.filepath(minified), params, data, function (response) {
                // if minified file not found, process original output
                Zy.output._output(response, Zy.location.filepath(filename), params, data);
            });

        } else {
            // process original output
            Zy.output._output(response, Zy.location.filepath(filename), params, data);
        }
    },

    send: function (response, params) {
        response.writeHead(
            (typeof params.code === 'number')   ? params.code   : 200,
            (typeof params.params === 'object') ? params.params : {}
        );

        if (typeof params.content !== 'undefined') {
            response.end(params.content, 'utf-8');
        } else {
            response.end();
        }
    },

    redirect: function (response, location) {
        response.statusCode = 302;
        response.setHeader('Location', location);
        response.end();
    },

    complete: function (request, response, output) {
        // process output...
        var outputType = Zy.output.type(output);

        if (outputType === Zy.output.FILE) {
            // file...
            // - load file
            var content = Zy.output.load(
                response,
                output,
                {
                    200: function (content) {
                        // get content type
                        var ext         = Zy.lib.path.extname(output),
                            contentType = Zy.config.contentType[ext];

                        if (typeof contentType !== 'string') {
                            // not found in contentType mapping, default to HTML
                            contentType = 'text/html';
                        }

                        // - send output
                        Zy.output.send(
                            response,
                            {
                                'content':  content,
                                'params':   {
                                    'Content-Type': contentType
                                }
                            }
                        );
                    }
                }
            );

        } else if (outputType === Zy.output.TEMPLATE) {
            // template...
            Zy.output._output_template(
                response,
                output,
                { }
            );

        } else if (outputType === Zy.output.FUNCTION) {
            // function...
            // - get output
            var content = output(request, response);

            // - send output?
            if (typeof content === 'string') {
                // only handle content output if function returns a string, otherwise
                // assume the function handles output itself
                Zy.output.send(
                    response,
                    {
                        'content': content
                    }
                );
            }
        }
    },

    post: function (request, response, oncomplete) {
        // check for login request
        var post_data = '';

        request.on('data', function (data) {
            post_data += data.toString();
        });

        request.on('end', function () {
            // execute oncomplete callback, passing in POST data
            oncomplete(
                request,
                response,
                Zy.lib.querystring.parse(post_data)
            );
        });
    },

    _template_cache: { },

    _output_template: function (response, path, tokens) {
        if (typeof Zy.output._template_cache[path] == 'undefined') {
            // cache template to a function, then serve it
            Zy.output._output(
                response,
                Zy.location.filepath(path),
                {
                    200: function (content, tokens) {
                        // - load template, compile to function and cache
                        Zy.output._template_cache[path] = new Zy.lib.template.Template(content);

                        // - send output
                        Zy.output.send(
                            response,
                            {
                                'content':  Zy.output._template_cache[path].render(tokens),
                                'params':   {
                                    'Content-Type': 'text/html'
                                }
                            }
                        );
                    }
                },
                tokens
            );

        } else {
            // serve ready-cached template
            Zy.output.send(
                response,
                {
                    'content':  Zy.output._template_cache[path].render(tokens),
                    'params':   {
                        'Content-Type': 'text/html'
                    }
                }
            );
        }
    },

    _cache_structure: function (callback) {
        var filename = Zy.location.filepath(Zy.config.location.original.templates + '/parts/structure.tpl');

        // check that file exists
        Zy.lib.fs.exists(filename, function (exists) {
            if (exists) {
                Zy.lib.fs.readFile(filename, function (error, content) {
                    if (!error) {
                        // no error, execute 200 callback
                        callback(content);

                    } else {
                        // send 500 response
                        Zy.output.send(
                            response,
                            {
                                code: 500
                            }
                        );
                    }
                });
            }
        });
    },

    _output_structure: function (request, response, path, tokens) {
        // if array of templates is specified, intercept
        if (typeof path == 'object') {
            return Zy.output._output_structure_array(request, response, path, tokens);
        }


        // add default values to tokens
        tokens = tokens || {};
        if (typeof tokens['mode'] == 'undefined') {
            tokens['mode'] = 'index';
        }


        // cache / serve cache...
        if (typeof Zy.output._template_cache[path] == 'undefined') {
            // cache template to a function, then serve it
            Zy.output._output(
                response,
                Zy.location.filepath(path),
                {
                    200: function (content, tokens) {
                        Zy.output._cache_structure(function (structure) {
                            // - load template, compile to function and cache
                            Zy.output._template_cache[path] = new Zy.lib.template.Template(structure);

                            // - send output
                            Zy.output.send(
                                response,
                                {
                                    'content':  Zy.output._template_cache[path].render(
                                        Zy.util.merge(
                                            {
                                                'content': content
                                            },
                                            tokens
                                        )
                                    ),
                                    'params':   {
                                        'Content-Type': 'text/html'
                                    }
                                }
                            );
                        });
                    }
                },
                tokens
            );

        } else {
            // serve ready-cached template
            d('2');
            Zy.output.send(
                response,
                {
                    'content':  Zy.output._template_cache[path].render(tokens),
                    'params':   {
                        'Content-Type': 'text/html'
                    }
                }
            );
        }
    },

    _output_structure_array: function (request, response, path, tokens) {
        // if array of templates is not specified, intercept
        if (typeof path != 'object') {
            return Zy.output._output_structure(request, response, path, tokens);
        }

        // parse url
        var url = Zy.location.parse(request.url, true);

        // cache all templates to functions, then serve
        var stack = [];

        for (var i in path) {
            if (typeof Zy.output._template_cache[path[i]] == 'undefined') {
                (function (tpl) {
                    stack.push(function (onsuccess) {
                        Zy.output._output(
                            response,
                            Zy.location.filepath(tpl),
                            {
                                200: function (content, tokens, onsuccess) {
                                    Zy.output._template_cache[tpl] = new Zy.lib.template.Template(content.toString('utf-8'));

                                    // run async callback
                                    onsuccess(null);
                                }
                            },
                            tokens,
                            null,
                            onsuccess
                        );
                    });

                })(path[i]);
            }
        }


        // setup async stack and finish callback (to render templates into structure)
        Zy.lib.async.series(
            stack,
            function (err, results) {
                // render output
                var content = '';

                for (var i in path) {
                    content += Zy.output._template_cache[path[i]].render(tokens);
                }

                // send rendered templates into structure
                Zy.output._cache_structure(function (structure) {
                    // - load template, compile to function and cache
                    Zy.output._template_cache[url.pathname] = new Zy.lib.template.Template(structure.toString('utf-8'));

                    // - send output
                    Zy.output.send(
                        response,
                        {
                            'content':  Zy.output._template_cache[url.pathname].render(
                                Zy.util.merge(
                                    {
                                        'content': content
                                    },
                                    tokens
                                )
                            ),
                            'params':   {
                                'Content-Type': 'text/html'
                            }
                        }
                    );
                });
            }
        );
    },

    _output: function (response, filename, params, data, onerror, onsuccess) {
        // check that file exists
        Zy.lib.fs.exists(filename, function (exists) {
            if (exists) {
                Zy.lib.fs.readFile(filename, function (error, content) {
                    if (!error) {
                        // no error, execute 200 callback
                        params[200](content, data, onsuccess);

                    } else {
                        // send 500 response
                        Zy.output.send(
                            response,
                            {
                                code: 500
                            }
                        );
                    }
                });

            } else {
                // run error callback?
                if (typeof onerror == 'function') {
                    onerror(response);

                } else {
                    // send 404 response
                    Zy.output.send(
                        response,
                        {
                            code: 404
                        }
                    );
                }
            }
        });
    }
};


// define scripting functionality
Zy.scripting = {
    cachebreak: function () {
        return Math.round(Math.round(new Date().getTime() / 1000) / 60);
    },

    iterateFilePath: function (filepath, theFilter, group, individual) {
        // if filter is not expressed as a function, assume file extension string and create function
        if (typeof theFilter == 'string') {
            var filterString = theFilter;

            theFilter = function (filename) {
                return (filename.substr(-filterString.length) == filterString);
            };
        }

        // iterate
        Zy.lib.fs.readdir(
            filepath,
            function (err, files) {
                if ((typeof files == 'object') && (files.length > 0)) {
                    var filtered = files.filter(theFilter);

                    if (filtered.length > 0) {
                        // execute group, or individual callback?
                        if (typeof group == 'function') {
                            group(filepath, filtered);
                        }

                        if (typeof individual == 'function') {
                            filtered.forEach(function (file) {
                                individual(filepath + file);
                            });
                        }
                    }
                }
            }
        );
    },

    iterateFilePathSync: function (filepath, theFilter, group, individual) {
        // if filter is not expressed as a function, assume file extension string and create function
        if (typeof theFilter == 'string') {
            var filterString = theFilter;

            theFilter = function (filename) {
                return (filename.substr(-filterString.length) == filterString);
            };
        }

        // iterate
        var files = Zy.lib.fs.readdirSync(filepath);

        if ((typeof files == 'object') && (files.length > 0)) {
            var filtered = files.filter(theFilter);

            if (filtered.length > 0) {
                // execute group, or individual callback?
                if (typeof group == 'function') {
                    group(filepath, filtered);
                }

                if (typeof individual == 'function') {
                    filtered.forEach(function (file) {
                        individual(filepath + file);
                    });
                }
            }
        }
    },

    touchFiles: function (filepaths) {
        var fd,
            date = new Date();

        // iterate through filepaths...
        for (var i = 0, len = filepaths.length; i < len; i++) {
            fd = Zy.lib.fs.openSync(filepaths[i], 'r');

            // set file time
            Zy.lib.fs.futimes(fd, date, date);
        }
    }
};


// define server start functionality
Zy.start = function (config) {
    // merge specified config into default config, overwriting where provided
    Zy.config = Zy.util.merge(Zy.config, config);


    // setup server
    Zy.lib.http
        .createServer(function (request, response) {
            // parse URL into useful parts
            var url = Zy.location.parse(request.url, true);

            // look for specified route...
            var output = Zy.config.routes[request.method][url.pathname];

            if (typeof output === 'undefined') {
                // route not found...
                if (request.method === 'POST') {
                    // use common POST handler?
                    if (typeof Zy.config.routes[request.method] == 'function') {
                        output = Zy.config.routes[request.method];
                    } else {
                        output = Zy.routing.get(404);
                    }

                } else {
                    // check if reference is to an allowable file location...
                    if (Zy.location.type(url.pathname) === Zy.location.FILE) {
                        // a file...
                        // - check if it is in an allowable location? (default: yes)
                        if ((typeof Zy.config.safeDirectories !== 'object') ||
                            (typeof Zy.config.safeDirectories[Zy.location.path(url.pathname)] !== 'undefined')) {

                            // an allowable location, modify to a retrievable reference
                            output = url.pathname;

                        } else {
                            // not an allowable location
                            output = Zy.routing.get(403);
                        }

                    } else {
                        // not a file, default to 404 page
                        output = Zy.routing.get(404);
                    }
                }
            }


            // check if output has additional requirements (passed as an object)
            if (typeof output == 'object') {
                var reqs = output[0];

                if ((typeof reqs['auth'] == 'boolean') && (reqs['auth'] === true)) {
                    try {
                        Zy.lib.session.read(function (session) {
                            console.log(session);

                            // route requires authentication...
                            if ((typeof session == 'undefined') ||
                                (typeof session.username == 'undefined') ||
                                (typeof session.password == 'undefined')) {

                                // not authenticated, direct to index
                                Zy.output.complete(request, response, Zy.routing.get('/'));

                            } else {
                                // authenticated, continue
                                Zy.output.complete(request, response, output[1]);
                            }
                        });

                    } catch (e) {
                        // session store is not operational, direct to main page
                        Zy.output.complete(request, response, Zy.routing.get('/'));
                    }

                } else {
                    // authentication not required, continue
                    Zy.output.complete(request, response, output[1]);
                }

            } else {
                // simple path definition, continue
                Zy.output.complete(request, response, output);
            }
        })
        .listen(Zy.config.port);


    // inform that server has started on specified port
    console.log('Server running at http://127.0.0.1:' + Zy.config.port);
};


// make Zy accessible as an imported Node module
exports.Zy = Zy;