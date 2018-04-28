"use strict";

const gulp = require('./tasks')
const concat = require('gulp-concat');
const _ = require('lodash');
const through2 = require('through2')
const path = require('path')

gulp.task('watch', ['build:dist'], function () {
    const nodemon = require('gulp-nodemon')
    let stream = nodemon({script: null, watch: 'src', ignore: ['ignored.js'], ext: 'js', tasks: ['build:dist']})
    
    return stream
        .on('restart', function () {
            console.log('restarted!')
        })
        .on('crash', function () {
            console.error('Application has crashed!\n')
            stream.emit('restart', 10)  // restart the server in 10 seconds
        })
})

gulp.task('bower', () => {
    const bower = require('gulp-bower');
    return bower()
})

function ejsPlugin(paths) {
    const pkg = require(path.join(process.cwd(), './package.json'))
    return require('map-stream')(function (file, cb) {
        if (_.isUndefined(paths) || _.includes(paths, file.path)) {
            if(!file.isBuffer()) throw new Error('Unsupported Vinyl file type')
            let rendered = require('ejs').compile(String(file.contents))({package: pkg})
            file.contents = new Buffer(rendered)
        }
        cb(null, file)
    })
}

gulp.task('build:dist', ['build:dist:bz-admin'], () => {
    return gulp.src([
        './bower_components/lodash/lodash.js',
        './bower_components/eventemitter3/index.js',
        './src/bkendz.js',
        './bower_components/moment/moment.js'
    ])
        .pipe(ejsPlugin([path.resolve('./src/bkendz.js')]))
        .pipe(concat('bkendz.js'))
        .pipe(gulp.dest('dist'))
})

gulp.task('build:dist:bz-admin', ['bower'], () => {
    return gulp.src(['./src/bkendz-admin.js'])
        .pipe(concat('bkendz-admin.js'))
        .pipe(gulp.dest('dist'))
})

_.each(['patch', 'minor'], (bumpType) => {
    
    gulp.task(`publish:${bumpType}`, ['build:dist'], () => {
        return require('npm-publish-release')(bumpType, {verbose: true})
            .then(function () {
                console.log(`[Release] ${bumpType} complete.`);
            })
    })
})