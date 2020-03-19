'use strict'

/** @module db */
/** General purpose SQL db library for Postgres and sqlite3 alternatively. Used for prototyping and then deployment. */

let Pool;
const squelRaw = require('squel')
const path = require('path')
const squel = squelRaw.useFlavour('postgres')

let log = {
    info  : (fn, msg) => { console.log(`[${fn}] ${msg}`) },
    warn  : (...args) => { console.warn(args)  },
    error : (...args) => { console.error(args) }
}

/** Class representing a database connection */
class DB {

	/**
	 * Initialized connection to database and create client.
	 *
	 * 	@constructor
	 *  @param 	{String}  	name 	Table name to connect to
	 */
	constructor (name, pool) {
		const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/sandbox'
		this._tableName = name
		this.squel = squel
		if (!pool) {
			Pool = require('pg').Pool
			this.pool = new Pool({connectionString : DATABASE_URL })
		} else {
			this.pool = pool; //try this???
		}
	}

	async connect () {
		try {
			await this._createTable();
		} catch (err) {
			//
		}
	}

	/**
	 * Create an empty, column-less table and invoke this._describeTable().
	 *
	 */
	async _createTable (silent = true) {
		const fn = `${this._tableName}._createTable`
		const create = `CREATE TABLE IF NOT EXISTS ${this._tableName} ();`
		let res;
		if (!silent) log.info('DB._createTable', create)
		try {
			await this.query(create)
		} catch (err) {
			if (err.code === '42P07') {
				if (!silent) log.info(fn, `TABLE ${this._tableName} already exists`)
			} else {
				log.error(fn, { err: err })
			}
		}
		if (!silent && res) log.info(fn, `Created TABLE ${this._tableName}`)
		await this._describeTable()
	}

	/**
	 * Query the table description and build an array of columns to alter.
	 *
	 */
	async _describeTable () {
		const fn = `${this._tableName}._describeTable`
		let fullPath = path.join(process.cwd(), `./table/${this._tableName}.json`)
		const fields = require(fullPath)
		let alterFields = []
		const describe = `SElECT column_name, data_type, character_maximum_length FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = '${this._tableName}';`
		let res;
		try {
			res = await this.query(describe);
		} catch (err) {
			log.error(fn, { err : err })
		}
		if (res) {
			alterFields = this._compareFields(fields, res)
			await this._alterTable(alterFields)
		}
	}

	/**
	 * Query the table description and build an array of columns to alter.
	 *
	 *  @param 	{Array}  master 	Array of columns to compare
	 *  @param 	{Object} current 	Response from query
	 */
	_compareFields (master, current) {
		let currentMap = {}
		let masterCols = Object.keys(master)
		let currentCols = current.rows.map(elem => {
			currentMap[elem.column_name]
			return elem.column_name
		})
		let inMaster = []
		let inCurrent = []
		let toChange = []
		let alterFields = []
		for (let col of masterCols) {
			if (currentCols.indexOf(col) === -1) {
				inMaster.push(col)
			}
		}
		for (let col of currentCols) {
			if (masterCols.indexOf(col) === -1) {
				inCurrent.push(col)
			}
		}
		for (let col of inMaster) {
			alterFields.push({ add : true, col : col, str : master[col] })
		}
		for (let col of inCurrent) {
			alterFields.push({ drop : true, col : col })
		}
		return alterFields
	}

	/**
	 * Generate ALTER statement to either ADD or DROP column.
	 *
	 *  @param 	{Object}  obj 	Object containing alter information
	 *
	 *  @param 	{String} 	Alter table query
	 */
	_alterField (obj) {
		let str
		if (obj.add) {
			str = `ALTER TABLE ${this._tableName} ADD COLUMN ${obj.col} ${obj.str}; `
		} else if (obj.drop) {
			str = `ALTER TABLE ${this._tableName} DROP COLUMN ${obj.col}; `
		}
		return str
	}

	/**
	 * Generate and combine all ALTER statements and apply to the 
	 * table with query.
	 *
	 *  @param 	{Array}  	fields 	Array of objects from comparing current to master.
	 *  @param  {Boolean} 	silent 	Whether or not to hide log statements from console
	 */
	async _alterTable (fields, silent = true) {
		const fn = `${this._tableName}._alterTable`
		let alter = '';
		let res;
		for (let col of fields) {
			alter += this._alterField(col)
		}

		if (alter === '') {
			if (!silent) log.info(fn, `TABLE ${this._tableName} is up to date`)
			return true
		}

		if (!silent) log.info(fn, alter)

		try {
			res = await this.query(alter)
		} catch (err) {
			log.error(fn, err)
		}
		let f = fields.map(elem => { return elem.col })

		log.info(fn, `TABLE ${this._tableName} updated columns ${f.join(',')}`)
	}

	/**
	 * Drop the table associated with the class.
	 */
	_wipeTable () {
		const fn = `${this._tableName}._wipeTable`
		const query = `DROP TABLE ${this._tableName};`
		this.query(query).then((err, res) => {
			log.info(fn, `TABLE ${this._tableName} wiped`)
		}).catch(err => {
			return log.error(fn, { caught : true, err : err })
		})
	}

	/**
	 * Insert record into table associated with class. Returns a promise.
	 * 
	 *  @param 	{Object}  obj 	All values to insert
	 *  @param  {Boolean} 	silent 	Whether or not to hide log statements from console
	 *
	 *  @return {Function}  Promise of query
	 */
	insert (obj, silent = true) {
		const fn = `${this._tableName}.insert`
		const query = squel.insert() //{ replaceSingleQuotes: true }
						.into(this._tableName)
						.setFields(obj)
						.toString()
		if (!silent) {
			log.info(fn, query)
		}
		return this.query(query)
	}

	/**
	 * Insert record into table associated with class. Returns a promise.
	 * 
	 *  @param  {String}  where WHERE statement to select rows to update
	 *  @param 	{Object}  obj 	All values to update in row
	 *  @param  {Boolean} 	silent 	Whether or not to hide log statements from console
	 *
	 *  @return {Function}  Promise of query
	 */
	update (where, obj, silent = true) {
		const fn = `${this._tableName}.update`
		const query = squel.update() //{ replaceSingleQuotes: true }
						.table(this._tableName)
						.where(where)
						.setFields(obj)
						.toString()
		if (!silent) {
			log.info(fn, query)
		}
		return this.query(query)
	}

	/**
	 * List all records from table associated with the class.
	 *
	 *  @param  {Boolean} 	silent 	Whether or not to hide log statements from console
	 *
	 *  @return {Function}  Promise of query
	 */
	list (silent = true) {
		const fn = `${this._tableName}.list`
		const query = squel.select()
						.from(this._tableName)
						.toString()
		if (!silent) {
			log.info(fn, query)
		}
		return this.query(query)
	}

	/**
	 * List all records from table associated with the class that match
	 * the supplied WHERE statement.
	 *
	 *  @param  {String}  where 	WHERE statement of rows to return
	 *  @param  {Boolean} 	silent 	Whether or not to hide log statements from console
	 *
	 *  @return {Function}  Promise of query
	 */
	find (where, silent = false) {
		const fn = `${this._tableName}.find`
		const query = squel.select()
						.from(this._tableName)
						.where(where)
						.toString()
		if (!silent) {
			log.info(fn, query)
		}
		return this.query(query)
	}

	/**
	 * Perform a DELETE statement WHERE constraint is satisfied.
	 *
	 *  @param  {String}  where 	WHERE statement of rows to return
	 *  @param  {Boolean} 	silent 	Whether or not to hide log statements from console
	 *
	 *  @return {Function}  Promise of query
	 */
	delete (where, silent = false) {
		const fn = `${this._tableName}.delete`
		const query = squel.delete()
					.from(this._tableName)
					.where(where)
					.toString()
		if (!silent) {
			log.info(fn, query)
		}
		return this.query(query)
	}

	/**
	 * Open-ended query statment. Opens connection to the pool, gets a client  then closes
	 * the client.
	 *
	 *  @param  {String}  query 	Query statement to run
	 *
	 *  @return {Function}  Promise of query
	 */
	query (query) {
		const fn = `${this._tableName}.query`
		return new Promise(async (resolve, reject) => {
			let client;
			let res;
			try {
				client = await this.pool.connect();
			} catch (err) {
				return reject(err);
			}

			try {
				res = await client.query(query);
			} catch (err) {
				try {
					await client.release();
				} catch (err) {
					return reject(err);
				}
				return reject(err);
			}

			try {
				await client.release();
			} catch (err) {
				return reject(err);
			}

			return resolve(res);
		});
	}
	/**
	 * Query using repared statements.
	 *
	 *  @param  {String}  query 	A prepared statement to run
	 *  @param  {Array}   data 		Array of values
	 *
	 *  @returns {Function}  Promise of query
	 */
	prepared (query) {
		const fn = `${this._tableName}.query`
		return new Promise(async (resolve, reject) => {
			let client;
			let res;
			try {
				client = await this.pool.connect();
			} catch (err) {
				return reject(err);
			}

			try {
				res = await client.query(query, data);
			} catch (err) {
				try {
					await client.release();
				} catch (err) {
					return reject(err);
				}
				return reject(err);
			}

			try {
				await client.release();
			} catch (err) {
				return reject(err);
			}

			return resolve(res);
		});
	}
}

module.exports = DB