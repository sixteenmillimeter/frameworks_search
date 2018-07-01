/*jshint esversion:6, strict:true, asi:true, node:true */

'use strict'

/** @module dblite */
/** General purpose database wrapper for sqlite3 with squel. */

const sqlite3 = require('sqlite3').verbose()
const squel = require('squel')
const path = require('path')
const fs = require('fs')

const DB_FILE = process.env.DB_FILE || './data/data.file'
let db

/** Class representing database functionality */
class Database {
	/**
	 * Accepts table name which binds all actions to that table
	 * unless defined otherwise while using the bare .query() function.
	 *
	 * @constructor
	 *
	 * @param {string} table Table name used in queries
	 *
	 */
	constructor (table) {
		db = new sqlite3.Database(DB_FILE)
		this.squel = squel
		this._table = table
		this._getSchema()
		if (this._jsonSchemaRaw) {
			this._compareSchema()
		} else {
			this._createTable()
		}
		
	}
	/**
	 * (internal) Create a table from a schema json file.
	 */
	_createTable () {
		this._run(this._schema, false)
	}
	_getSchema () {
		let fullPath = path.join(process.cwd(), `./table/${this._table}`)
		if (fs.existsSync(`${fullPath}.json`)) {
			return this._jsonSchema(fullPath)
		} else if (fs.existsSync(`${fullPath}.sql`)) {
			return this._sqlSchema(fullPath)
		} else {
			console.error(`Cannot find table ${this._table}`)
		}
	}
	_jsonSchema (fullPath) {
		const schema = require(`${fullPath}.json`)
		const keys = Object.keys(schema);
		let query = `CREATE TABLE IF NOT EXISTS ${this._table} ( \n`
		
		for (let field in schema) {
			query += `${field} ${schema[field]},\n`
		}
		query = query.substring(0, query.length - 2)
		query += ');'
		this._jsonSchemaRaw = schema
		this._schema = query
	}
	_compareSchema (cb) {
		const q = squel.select()
					.from(this._table)
					.limit(1)
					.toString()
		return this._all(q, this._compareCb.bind(this))
	}
	_compareCb (err, rows) {
		if (err) {
			if (err.errno !== 1) {
				console.warn(err)
			} else {
				console.log(`Table ${this._table} does not exist, creating...`)
			}
			return this._createTable()
		}
		let current
		let update = Object.keys(this._jsonSchemaRaw)
		let diff = []
		if (err) {
			console.error(err)
		}
		if (rows.length === 1) {
			current = Object.keys(rows[0])
			//if update has key not in current schema, add
			for (let key of update) {
				if (current.indexOf(key) === -1) {
					diff.push({ add : true, col : key,  str : this._jsonSchemaRaw[key] })
				}
			}
			//if current has key not in update, drop
			for (let key of current) {
				if (update.indexOf(key) === -1) {
					diff.push({ drop : true, col : key })
				}
			}
			if (diff.length > 0) {
				this._schema = ''
			}
			for (let d of diff) {
				this._schema += this._alterField(d)
			}
		} else {
			this._schema = `DROP TABLE ${this._table};` + this._schema;
		}
		return this._createTable()
	}
	_alterField (obj) {
		let str
		if (obj.add) {
			str = `ALTER TABLE ${this._table} ADD COLUMN ${obj.col} ${obj.str}; `
		} else if (obj.drop) {
			str = `ALTER TABLE ${this._table} DROP COLUMN ${obj.col}; `
		}
		return str
	}
	_sqlSchema (fullPath) {
		this._schema = fs.readFileSync(`${fullPath}.sql`)
	}
	/**
	 * (internal) Execute SQL statement against the db, no callback.
	 */
	_run (q, print = true) {
		if (print) {
			//console.log(q)
		}
		db.run(q)
	}
	/**
	 * (internal) Execute SQL statement against the db with a callback.
	 */
	_all (q, cb, print) {
		if (print) {
			console.log(q)
		}
		db.all(q, cb)
	}
	/**
	 * Perform SELECT on *.
	 */
	list (cb, print = true) {
		const query = squel.select()
					.from(this._table)
					.toString()
		this._all(query, cb, print)
	}
	/**
	 * Perform SELECT with a WHERE stament.
	 */
	find (where, cb, print = true) {
		const query = squel.select()
					.from(this._table)
					.where(where)
					.toString()
		this._all(query, cb, print)
	}
	/**
	 * Perform an INSERT with the fields from the supplied object.
	 */
	insert(obj, cb, print = true) {
		const query = squel.insert()
					.into(this._table)
					.setFields(obj)
					.toString()
		this._all(query, cb, print)
	}
	/**
	 * Perform UPDATE on table if a WHERE statement is satisfied
	 * and with the fields of the table.
	 */
	update (where, obj, cb, print = true) {
		const query = squel.update()
					.table(this._table)
					.where(where)
					.setFields(obj)
					.toString()
		this._all(query, cb, print)
	}
	/**
	 * Perform a DELETE statement WHERE constraint is satisfied.
	 */
	delete (where, cb, print = true) {
		const query = squel.delete()
					.from(this._table)
					.where(where)
					.toString()
		this._all(query, cb, print)
	}

	drop () {
		const query = `DROP TABLE ${this._table};`
		this._run(query)
	}
}

module.exports = Database

/**
 * Usage
 *
 * ```const DB = require('db')```
 *
 * then...
 * 
 * ```const table = new DB('table')```
 */
