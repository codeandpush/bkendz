/**
 * Created by anthony on 18/03/2018.
 */
"use strict";

const gulp = require('gulp')
const libDb = require('../lib/db')
const fs = require('fs')
const path = require('path')


/*** Framework Tasks ***/
gulp.task('db:init', () => libDb.init(false))

gulp.task('db:init:seed', () => libDb.init(true))

gulp.task('db:init:migrations:generate', ['db:migrations:clean', 'db:clean:dev'], () => {
    return libDb.generateMigrations().then(() => libDb.init())
})

gulp.task('db:migrations:clean', () => deleteFiles('./db/migrations', (fName) => fName !== '.keep'))

gulp.task('db:clean:dev', () => {
    let dbPath = require('./db.js').development.storage
    
    if (!fs.existsSync(dbPath)) return
    fs.unlinkSync(dbPath)
})

gulp.task('default', ['db:init:migrations:generate',], () => {
    libDb.init(true)
})

module.exports = gulp

function deleteFiles(dirPath, fn = null) {
    if(!fs.existsSync(dirPath)) return
    for (let fName of fs.readdirSync(dirPath)) {
        if (!fn || fn(fName)) {
            fs.unlinkSync(path.join(dirPath, fName))
        }
    }
}