/**
 * Created by anthony on 07/04/2017.
 */
"use strict";

const exec = require('child_process').execSync
const Promise = require('bluebird')
const util = require('util')
const _ = require('lodash')
const path = require('path')
const fs = require('fs')
const Sequelize = require('sequelize')
const moment = require('moment')

function init(seed = false) {
    let sequelizeCmd = './node_modules/.bin/sequelize';
    let args = '--config=db.js --migrations-path=db/migrations --seeders-path=db/seeders';
    console.log(exec(util.format('%s db:migrate %s', sequelizeCmd, args)).toString());
    
    if (seed) console.log(exec(util.format('%s db:seed:all %s', sequelizeCmd, args)).toString());
    return Promise.resolve(true)
}

const INDEX_TEMPLATE_STR = `
'use strict';
const Sequelize = require('sequelize')
const env       = process.env.NODE_ENV || 'development'
const config    = require(__dirname + '/../config/db.js')[env]
const path = require('path')
const fs = require('fs')
const DbObject = require('../lib/db').DbObject

let db = {}
let sequelize

if (config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable])
} else {
    if (config.dialect === 'sqlite') config.storage = path.join(__dirname, '../', config.storage)
    
    sequelize = new Sequelize(config.database, config.username, config.password, config)
}

function importer(filePath){
    let defineCall = require(filePath)
    
    if(defineCall.prototype instanceof DbObject){
        const DbObjCls = defineCall
        
        defineCall = function() {
             return DbObjCls.getModel.apply(DbObjCls, [...arguments])
        }
    }

    return sequelize.import(filePath, defineCall)
}

let modelFiles = fs.readdirSync(__dirname).map((fName) => __dirname + '/'+ fName)
let modelFilePath
<% _.forEach(modelInfo, function([modelName, fileName]) { %>
modelFilePath = path.join(__dirname, '<%= fileName %>')
if(modelFiles.includes(modelFilePath)) db['<%= modelName %>'] = importer(modelFilePath)
<% }); %>

Object.keys(db).forEach((modelName) => { if (db[modelName].associate) db[modelName].associate(db) })

db.sequelize = sequelize
module.exports = db
`

function writeModelsIndex() {
    let compiled = _.template(INDEX_TEMPLATE_STR)
    let modelPath = path.join(__dirname, '../models')
    let indexPath = path.join(modelPath, '/index.js')
    let modelFileNames = fs.readdirSync(modelPath)
    
    let entries = modelFileNames.map((modelFileName) => {
        let cls = require(path.join(modelPath, modelFileName))
        if(!cls.name) return null
        return [cls.name, modelFileName]
    })
    
    return fs.writeFileSync(indexPath, compiled({modelInfo: _.compact(entries)}))
}

const MIG_TEMPLATE = `'use strict';
module.exports = {
  up: function(queryInterface, Sequelize) {
    return queryInterface.createTable('<%= tableName %>', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      <%= attributeStr.trim() %>
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: function(queryInterface, Sequelize) {
    return queryInterface.dropTable('<%= tableName %>');
  }
};`

function generateMigrations() {
    const models = require('../models')
    const Sequelize = require('sequelize')
    
    let modelNames = _.without(Object.keys(models), 'sequelize')
    let utc = moment().utc()
    
    let templateCompiled = _.template(MIG_TEMPLATE)
    
    let FakeDataTypes = new Proxy({}, {
        get: function (target, property) {
            if (!(_.isString(property) && property.toUpperCase() === property)) return
            
            let callCatcher = {attrName: property}
            return function fakeAttr() {
                let args = Array.from(arguments)
                args = args.map((val) => _.isString(val) && `'${val}'` || val).join(', ')
                return args.length === 0 ? `Sequelize.${callCatcher.attrName}` : `Sequelize.${callCatcher.attrName}(${args})`
            }
        }
    })
    
    function getDataForCls(cls) {
        let references = new Set()
        
        const settle = (obj) => {
            for(let key of Object.keys(obj)){
                let v = obj[key]
                if (_.isPlainObject(v) && v.type && v.type.name === 'fakeAttr' && v.type() === 'Sequelize.VIRTUAL'){
                    delete obj[key]
                    continue
                }
                
                if(key === 'references') {
                    references.add(v.model)
                    v.model = Sequelize.Utils.pluralize(v.model)
                }
                
                if(_.isFunction(v) && v.name === 'fakeAttr') obj[key] = v()
                else if (_.isPlainObject(v)) settle(v)
            }
            return obj
        }
        return {attributes:settle(cls.columnDefs(FakeDataTypes)), references:references.values()}
    }
    
    let migFiles = []
    let migDirPath = path.join(__dirname, '../db/migrations')
    require('./utils').mkDirs(migDirPath)
    
    function stringify(obj) {
        let lines = []
        for(let key of Object.keys(obj)){
            let value = obj[key]
            if(_.isString(value) && !_.startsWith(value, 'Sequelize.')) value = `'${value}'`
            if(_.isPlainObject(value)) {
                let stringified = stringify(value)
                value = `{${stringified.substring(0, stringified.length - 1)}}`
            }
            lines.push(`${key}: ${value},`)
        }
        return lines.join('\n')
    }
    
    for(let n of modelNames){
        let res = `${utc.format('YYYYMMDDHHmmss')}-create-${_.kebabCase(n)}.js`
        let tableName = Sequelize.Utils.pluralize(n)
        let data = getDataForCls(models[n])
        let attributeStr = stringify(data.attributes)
        let migFile = path.join(migDirPath, res)
        
        fs.writeFileSync(migFile, templateCompiled({tableName, attributeStr, attributes:null}))
        migFiles.push(migFile)
        utc = utc.add(1, 's')
    }
    return Promise.resolve(migFiles)
}

class DbObject extends Sequelize.Instance {
    
    toJson(compact = true) {
        let res = this.toJSON()
        if (compact) {
            res = _.transform(res, (result, value, key) => {
                if (_.isUndefined(value) || _.isNull(value)) return
                result[key] = value
            }, {})
        }
        return res
    }
    
    static scopeDefs(){
        return {}
    }
    
    static columnDefs(DataTypes) {
        return {}
    }
    
    static getModel(sequelize, DataTypes) {
        if (this.prototype.Model) return this.prototype.Model
        //console.log('this=%s, sequelize=%s, DataTypes=%s', this, sequelize, DataTypes)
        let attrs = this.columnDefs(DataTypes)
        
        if(_.isEmpty(attrs)) return null
        
        let methods = {
            instanceMethods: {},
            getterMethods: {},
            setterMethods: {},
            classMethods: {},
            scopes: this.scopeDefs()
        }
        
        let meths = Object.getOwnPropertyNames(this.prototype).filter((m) => !['constructor', 'test'].includes(m))
        let clsMeths = Object.getOwnPropertyNames(this).filter((m) => _.isFunction(this[m]))
        
        // Hack: update instance and class methods to include super class
        for(let cls of [DbObject]) {
            if (this.prototype instanceof cls) {
                for (let attr of Object.getOwnPropertyNames(cls.prototype)) {
                    if (attr !== 'constructor' && !meths.includes(attr)) meths.push(attr)
                }
        
                for (let attr of Object.getOwnPropertyNames(cls)) {
                    if (_.isFunction(cls[attr]) && !clsMeths.includes(attr)) clsMeths.push(attr)
                }
            }
        }
        
        //console.log('DbObject(%s): instanceMethods=%s | classMethods=%s', this.name, meths, clsMeths)
        
        methods.instanceMethods = _.fromPairs(meths.map((m) => [m, this.prototype[m]]))
        methods.classMethods = _.fromPairs(clsMeths.map((m) => [m, this[m]]))
        
        Object.getOwnPropertyNames(this.prototype).forEach((v) => {
            let desc = Object.getOwnPropertyDescriptor(this.prototype, v)
            
            if(_.isFunction(desc['get'])){
                console.log('adding getter %s', v)
                methods.getterMethods[v] = desc.get
            }
            
            if(_.isFunction(desc['set'])){
                console.log('adding setter %s', v)
                methods.setterMethods[v] = desc.set
            }
        })
        
        let Model = this.prototype.$Model = this.prototype.Model = sequelize.define(this.name, attrs, methods)
        
        
        Model.Instance = this
        Model.refreshAttributes()
        
        if (Model.options.instanceMethods) {
            _.each(Model.options.instanceMethods, function(fct, name) {
                Model.Instance.prototype[name] = fct;
            });
        }
        
        return Model
    }
}

module.exports = {DbObject, init, generateMigrations, writeModelsIndex}