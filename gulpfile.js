"use strict";

const gulp = require('./tasks')
const concat = require('gulp-concat');
const bower = require('gulp-bower');
const publish = require('npm-publish-release');



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

gulp.task('publish:patch', () => {
    let child = publish({verbose: true})
        .then(function() {
            console.log('success!');
        })
        .catch(function(err) {
            console.error('Something went wrong:', err);
        })
        .done();
    
    return require('node-clean-exit')([child])
})

gulp.task('publish:minor', () => {
    console.log('publish minor')
})

gulp.task('publish:major', () => {
    console.log('publish major')
})