/**
 * Created by anthony on 28/02/2016.
 */
const repl = require('repl')
const replHistory = require('repl.history')
// environment configuration
const epa = require('epa')

const moment = require('moment')

let envName = process.env.NODE_ENV || 'dev'

// open the repl session
let replServer = repl.start({prompt: `Bkendz (${envName}) > `})

replHistory(replServer, process.env.HOME + '/.node_history')
// attach my modules to the repl context
replServer.context.epa = epa
replServer.context.lo = require('lodash')
replServer.context.moment = moment