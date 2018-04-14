"use strict";

const gulp = require('./tasks')
const concat = require('gulp-concat');
const bower = require('gulp-bower');
const publish = require('npm-publish-release');
const _ = require('lodash');
const nodemon = require('gulp-nodemon')

gulp.task('watch', ['build:dist'] , function () {
    let stream = nodemon({script: null, watch: 'src', ignore: ['ignored.js'], ext: 'js', tasks: ['build:dist'] })
    
    return stream
            .on('restart', function () {
                console.log('restarted!')
            })
            .on('crash', function() {
                console.error('Application has crashed!\n')
                stream.emit('restart', 10)  // restart the server in 10 seconds
            })
})

gulp.task('bower', () => {
    return bower()
})

gulp.task('build:dist', ['build:dist:bz-admin'], () => {
    return gulp.src(['./bower_components/eventemitter3/index.js',
    './src/bkendz.js'])
        .pipe(concat('bkendz.js'))
        .pipe(gulp.dest('dist'))
})

gulp.task('build:dist:bz-admin', ['bower'], () => {
    return gulp.src(['./src/bkendz-admin.js'])
        .pipe(concat('bkendz-admin.js'))
        .pipe(gulp.dest('dist'))
})

_.each(['patch', 'minor', 'major'], (bumpType) => {
    
    gulp.task(`publish:${bumpType}`, ['build:dist'], () => {
        return publish(bumpType, {verbose: true})
            .then(function() {
                console.log(`[Release] ${bumpType} complete.`);
            })
    })
})