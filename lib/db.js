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

function init(options) {
    let opts = options || {}
    let seed = opts.seed
    let rc = require('./utils').getRcConf()
    let sequelizeCmd = opts.sequelizeBinPath || path.join(__dirname, '../node_modules/.bin/sequelize')
    console.log('[dbinit] sequelizeBinPath:', sequelizeCmd)
    let args = `--config=${rc['config']} --migrations-path=${rc['migrations-path']} --seeders-path=${rc['seeders-path']}`
    console.log(exec(util.format('%s db:migrate %s', sequelizeCmd, args)).toString());
    
    if (seed) console.log(exec(util.format('%s db:seed:all %s', sequelizeCmd, args)).toString())
    return Promise.resolve(true)
}

const INDEX_TEMPLATE_STR = `
'use strict';
const fs = require('fs')
const path = require('path')
const config = require('<%= configRelPath %>')
const {ModelImporter} = require('<%= dbobjectPath %>')
const importer = new ModelImporter({config, configPath: '<%= configPath %>'})
let db = {}

let modelFiles = fs.readdirSync(__dirname).map((fName) => __dirname + '/'+ fName)
let modelFilePath
<% _.forEach(modelInfo, function([modelName, fileName]) { %>
modelFilePath = path.join(__dirname, '<%= fileName %>')
if(modelFiles.includes(modelFilePath)) db['<%= modelName %>'] = importer.fromFile(modelFilePath)
<% }); %>

Object.keys(db).forEach((modelName) => { if (db[modelName].associate) db[modelName].associate(db) })

db.sequelize = importer.sequelize
db.importer = importer
module.exports = db
`

class ModelImporter {
    
    constructor(opts) {
        opts = opts || {}
        let config = opts.config[opts.env || (process.env.NODE_ENV || 'development')]
        
        if (config.use_env_variable) {
            this._sequelize = new Sequelize(process.env[config.use_env_variable])
        } else {
            let storagePath = process.cwd()
            if (config.dialect === 'sqlite') config.storage = path.join(storagePath, './', config.storage)
            
            console.log('[ModelImporter] initializing sequelize:', JSON.stringify(config, null, 4))
            this._sequelize = new Sequelize(config.database, config.username, config.password, config)
        }
    }
    
    get sequelize() {
        return this._sequelize
    }
    
    fromFile(filePath) {
        let defineCall = require(filePath)
        
        function _defineCall(cls, ...rest) {
            return cls.setupModel.apply(cls, rest)
        }
        
        if(defineCall.prototype instanceof DbObject){
            defineCall = _.partial(_defineCall, defineCall)
        }
    
        return this.sequelize.import(filePath, defineCall)
    }
}

function writeModelsIndex(dirName, options) {
    options = _.merge({libDbPath: __filename}, options || {})
    dirName = dirName || __dirname
    let compiled = _.template(INDEX_TEMPLATE_STR)
    let modelPath = path.join(dirName, '../models')
    let indexPath = path.join(modelPath, '/index.js')
    let modelFileNames = fs.readdirSync(modelPath)
    
    let entries = modelFileNames.map((modelFileName) => {
        if (modelFileName === 'index.js') return null
        
        let modelFilePath = path.join(modelPath, modelFileName), cls = null
        try {
            cls = require(modelFilePath)
        } catch (error) {
            console.warn('[writeModelsIndex] error reading file: %s', modelFilePath)
        }
        if (!(cls && cls.name)) return null
        return [cls.name, modelFileName]
    })
    
    let renderArgs = _.merge(options, {modelInfo: _.compact(entries)})
    return fs.writeFileSync(indexPath, compiled(renderArgs))
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
    const conf = require('./utils').getRcConf()
    const models = require(conf['models-path'])
    const Sequelize = require('sequelize')
    
    let modelNames = Object.keys(models.importer.sequelize.models)
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
            for (let key of Object.keys(obj)) {
                let v = obj[key]
                if (_.isPlainObject(v) && v.type && v.type.name === 'fakeAttr' && v.type() === 'Sequelize.VIRTUAL') {
                    delete obj[key]
                    continue
                }
                
                if (key === 'references') {
                    references.add(v.model)
                    v.model = Sequelize.Utils.pluralize(v.model)
                }
                
                if (_.isFunction(v) && v.name === 'fakeAttr') obj[key] = v()
                else if (_.isPlainObject(v)) settle(v)
            }
            return obj
        }
        return {attributes: settle(cls.columnDefs(FakeDataTypes)), references: references.values()}
    }
    
    let migFiles = []
    let migDirPath = conf['migrations-path']
    require('./utils').mkDirs(migDirPath)
    
    function stringify(obj) {
        let lines = []
        for (let key of Object.keys(obj)) {
            let value = obj[key]
            if (_.isString(value) && !_.startsWith(value, 'Sequelize.')) value = `'${value}'`
            if (_.isPlainObject(value)) {
                let stringified = stringify(value)
                value = `{${stringified.substring(0, stringified.length - 1)}}`
            }
            lines.push(`${key}: ${value},`)
        }
        return lines.join('\n')
    }
    
    for (let n of modelNames) {
        let res = `${utc.format('YYYYMMDDHHmmss')}-create-${_.kebabCase(n)}.js`
        let tableName = Sequelize.Utils.pluralize(n)
        let data = getDataForCls(models[n])
        let attributeStr = stringify(data.attributes)
        let migFile = path.join(migDirPath, res)
        
        fs.writeFileSync(migFile, templateCompiled({tableName, attributeStr, attributes: null}))
        migFiles.push(migFile)
        utc = utc.add(1, 's')
    }
    return Promise.resolve(migFiles)
}

function schema() {
    let modelDefs = {}
    const conf = require('./utils').getRcConf()
    const models = require(conf['models-path'])
    _.each(models.sequelize.models, (modelCls) => {
        let colDefs = modelCls.columnDefs(models.sequelize.Sequelize.DataTypes)
        let defs = modelDefs[modelCls.name] = {createdAt: 'DATE', updatedAt: 'DATE'}
        
        for (let [colName, info] of _.toPairs(colDefs)) {
            defs[colName] = info.key
        }
    })
    return modelDefs
}

class DbObject extends Sequelize.Instance {
    
    toJson(compact = true) {
        let res = this.toJSON()
        if (compact) {
            res = _.transform(res, (result, value, key) => {
                if (_.isUndefined(value) || _.isNull(value)) return
                result[key] = value
            }, {type: this.constructor.name})
        }
        return res
    }
    
    static scopeDefs() {
        return {}
    }
    
    static isJunction() {
        return false
    }
    
    static columnDefs(DataTypes) {
        return {}
    }
    
    static setupModel(sequelize, DataTypes) {
        if (this.prototype.Model) return this.prototype.Model
        let attrs = this.columnDefs(DataTypes)
        
        if (_.isEmpty(attrs)) return null
        
        if (!(_.has(this.prototype, '$MODELS') && _.has(this.prototype, 'MODELS'))) {
            let models = this.prototype.MODELS = {}
            let $models = this.prototype.$MODELS = {}
            
            Object.defineProperty(this.prototype, 'Model', {
                get: function () {
                    return models[this.constructor.name]
                },
                set: function (model) {
                    models[this.constructor.name] = model
                }
            })
            
            Object.defineProperty(this.prototype, '$Model', {
                get: function () {
                    return $models[this.constructor.name]
                },
                set: function (model) {
                    $models[this.constructor.name] = model
                }
            })
        }
        
        let excludeProps = ['constructor', 'test', 'Model', '$Model',
            'MODELS', '$MODELS', 'rawAttributes',
            'attributes', '_isAttribute', 'validators']
        
        let computedMethods = getClsMethods(this, Sequelize.Instance.name, excludeProps)
        
        let methods = {
            instanceMethods: _.fromPairs(computedMethods.instanceMethods.map((m) => [m, this.prototype[m]])),
            classMethods: _.fromPairs(computedMethods.classMethods.map((m) => [m, this[m]])),
            getterMethods: computedMethods.getterMethods,
            setterMethods: computedMethods.setterMethods,
            scopes: this.scopeDefs()
        }
        
        let Model = this.prototype.$MODELS[this.name] = this.prototype.MODELS[this.name] = sequelize.define(this.name, attrs, methods)
        
        Model.Instance = this
        Model.refreshAttributes()
        
        if (Model.options.instanceMethods) {
            _.each(Model.options.instanceMethods, function (fct, name) {
                Model.Instance.prototype[name] = fct
            });
        }
        
        return Model
    }
}

function getClsMethods(clazz, untilClsName, excludeProps) {
    let superClsList = require('./utils').getSuperClasses(clazz, untilClsName)
    
    let setters = {}, getters = {}, meths = [], clsMeths = []
    let classes = _.concat([clazz], superClsList)
    
    for (let cls of classes) {
        let attributes = cls.prototype.attributes || []
        let skipList = _.concat(attributes, excludeProps)
        
        for (let attr of Object.getOwnPropertyNames(cls.prototype)) {
            if (skipList.includes(attr) || attr.startsWith('_')) continue
            
            let desc = Object.getOwnPropertyDescriptor(cls.prototype, attr)
            
            if (_.has(desc, 'get') || _.has(desc, 'set')) {
                if (_.isFunction(desc['get']) && !_.has(getters, attr)) {
                    getters[attr] = desc.get
                }
                
                if (_.isFunction(desc['set']) && !_.has(setters, attr)) {
                    setters[attr] = desc.set
                }
            } else {
                if (!meths.includes(attr)) meths.push(attr)
            }
        }
        
        for (let attr of Object.getOwnPropertyNames(cls)) {
            if (_.isFunction(cls[attr]) && !clsMeths.includes(attr)) clsMeths.push(attr)
        }
    }
    return {instanceMethods: meths, classMethods: clsMeths, getterMethods: getters, setterMethods: setters}
}

module.exports = {DbObject, init, generateMigrations, writeModelsIndex, schema, ModelImporter}