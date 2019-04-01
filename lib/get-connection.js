/* global Proxy */

var mssql = require('mssql');

module.exports = {


  friendlyName: 'Get connection',


  description: 'Get an active connection to a MSSQL database from the pool.',


  inputs: {

    manager: {
      friendlyName: 'Manager',
      description: 'The connection manager instance to acquire the connection from.',
      extendedDescription:
        'Only managers built using the `createManager()` method of this driver are supported. ' +
        'Also, the database connection manager instance provided must not have been destroyed--' +
        'i.e. once `destroyManager()` is called on a manager, no more connections can be acquired ' +
        'from it (also note that all existing connections become inactive-- see `destroyManager()` ' +
        'for more on that).',
      example: '===',
      required: true
    },

    meta: {
      friendlyName: 'Meta (custom)',
      description: 'Additional stuff to pass to the driver.',
      extendedDescription: 'This is reserved for custom driver-specific extensions.  Please refer to the documentation for the driver you are using for more specific information.',
      example: '==='
    }

  },


  exits: {

    success: {
      description: 'A connection was successfully acquired.',
      extendedDescription: 'This connection should be eventually released.  Otherwise, it may time out.  It is not a good idea to rely on database connections timing out-- be sure to release this connection when finished with it!',
      outputVariableName: 'report',
      outputDescription: 'The `connection` property is an active connection to the database.  The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
      // example: {
      //   connection: '===',
      //   meta: '==='
      // }
    },

    failed: {
      description: 'Could not acquire a connection to the database using the specified manager.',
      extendedDescription: 'This might mean any of the following:\n' +
        ' + the credentials encoded in the connection string are incorrect\n' +
        ' + there is no database server running at the provided host (i.e. even if it is just that the database process needs to be started)\n' +
        ' + there is no software "database" with the specified name running on the server\n' +
        ' + the provided connection string does not have necessary access rights for the specified software "database"\n' +
        ' + this Node.js process could not connect to the database, perhaps because of firewall/proxy settings\n' +
        ' + any other miscellaneous connection error',
      outputVariableName: 'report',
      outputDescription: 'The `error` property is a JavaScript Error instance explaining that a connection could not be made.  The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
      // example: {
      //   error: '===',
      //   meta: '==='
      // }
    }

  },


  fn: async function getConnection(inputs, exits) {
    // Note that if this driver is adapted to support managers which spawn
    // ad-hoc connections or manage multiple pools/replicas using PoolCluster,
    // then relevant settings would need to be included in the manager instance
    // so that connections can be appropriately fetched/opened here.
    //
    // For now, since we only support a single pool, we simply acquire a
    // connection from the pool.
    if (!inputs.manager.pool.connected) {
      inputs.manager.pool = await new mssql.ConnectionPool(inputs.manager.pool.config).connect();

      // return exits.failed(new Error('Need to deal with disconnected connection better.'));
    }
    let currentTransaction;
    const newConnection = new Proxy(inputs.manager.pool, {
      get(obj, prop) {
        if (prop === 'currentTransaction') {
          return currentTransaction;
        }
        if (prop === 'query') {
          if (currentTransaction) {
            const request = new mssql.Request(currentTransaction);
            return request.query.bind(request);
          }
          return obj[prop].bind(obj);
        }
        return obj[prop];
      },
      set(obj, prop, value) {
        if (prop === 'currentTransaction') {
          currentTransaction = value;
          return true;
        }
        obj[prop] = value;
        return true;
      },
      deleteProperty(obj, prop) {
        if (prop === 'currentTransaction') {
          currentTransaction = undefined;
          return true;
        }
        if (obj.hasOwnProperty(prop)) {
          delete obj[prop];
        }
      }
    });

    return exits.success({
      connection: newConnection,
      meta: inputs.meta
    });
  }


};