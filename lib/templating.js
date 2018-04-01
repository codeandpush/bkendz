/**
 * Created by anthony on 01/04/2018.
 */
const _ = require('lodash')
const ejs = require('ejs')
var template = ejs.compile
//let template = _.template
let fs = require('fs');
let path = require('path');

// Store templates as they're compiled in production.
let cache = {};

// Set the default template extension. Override as necessary.
let ext = 'html'

function _render(compiled, options) {
    try {
        return compiled(options)
    }catch (error){
        throw error
    }
}

// Set the special express property for templating to work.
function render(abs, options, cb) {
    let sync = !cb;
    try {
        
        // Helper function for sub-templating, store the original value for nested
        // sub-templates.
        console.log(`[Render] sync=${sync}, path=${abs}`)
        let dir = path.dirname(abs)
        options.include = function (rel) {
            let include = options.include;
            var str = render(path.resolve(dir, rel + '.' + ext), options)
            options.include = include
            return str
        }
        
        options.sourceURL = true
        
        // Check cache...
        let fn = options.cache && cache[abs];
        if (!fn) {
            if (sync) {
                var data = fs.readFileSync(abs, 'utf8');
                fn = cache[abs] = template(data, null, options);
            } else {
                return fs.readFile(abs, 'utf8', function (er, data) {
                    if (er) return cb(er);
                    fn = cache[abs] = template(data, null, options)
                    cb(null, _render(fn, options))
                });
            }
        }
        
        // Run and return template
        let str = _render(fn, options)
        if (sync) return str;
        cb(null, str);
    } catch (er) {
        if (sync) throw er;
        cb(er);
    }
}

module.exports = function (app, _ext) {
    app.engine(_ext ? ext = _ext : ext, render);
};