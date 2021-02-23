'use strict';

const DB = require('db');
const messages = new DB('messages')

const singleRe = new RegExp("'", 'g')

function getId() {
	const term = process.argv[process.argv.length - 1]
	if (term.indexOf('frameworks_search/print.js') === -1) {
		return term.replace(singleRe, "''")
	}
	console.error(`ERROR: Please include an id`)
	process.exit(1)
}

function display (rows) {
	for (let row of rows) {
		console.log(`FROM : ${row.from_name} <${row.from_email}>`)
		console.log(`TO   : ${row.response_to}`)
		console.log(`SUBJ : ${row.subject}`)
		console.log('===========================================')
		console.log(row.body)
	}
}

async function print () {
	const id = getId()
	const searchQuery = `SELECT from_name, from_email, response_to, subject, body
		FROM messages
		WHERE id = '${id}'
		LIMIT 1;`
	let res

	console.log(`Retrieving "${id}"...`)

	try {
		res = await messages.query(searchQuery)
	} catch (err) {
		console.error(err)
		process.exit(2)
	}

	display(res.rows)

}

async function main () {
	try {
		await messages.connect()
		await print()
	} catch (err) {
		console.error(err)
	}
	process.exit()
}

main()
