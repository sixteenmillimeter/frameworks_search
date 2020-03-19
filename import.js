'use strict'

//Anticipates the frameworks_archiver script is run in a peer
//directory to this project

//https://github.com/sixteenmillimeter/frameworks_archiver

const fs = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const exec = require('child_process').exec
const mbox = require('node-mbox')
const moment = require('moment')
const crypto = require('crypto')
const textract = require('textract')

const DB = require('db')

const messages = new DB('messages')

const ARCHIVES = {
	frameworks : '../frameworks_archiver/frameworks',
	hi_beam : '../frameworks_archiver/hi-beam/www.hi-beam.net/fw',
	archive_org : '../frameworks_archiver/archive-org/FRAMEWORKS'
}

const singleRe = new RegExp("'", 'g')

const LOG_DELIMETER = '========================================================================='
const GZ_DELIMETER = '-------------- next part --------------'

const YEAR_DELIMETER = ''

async function asyncExec (cmd) {
	return new Promise((resolve, reject) => {
		return exec(cmd, (err, stdio, stderr) => {
			if (err) return reject(err)
			return resolve(stdio)
		});
	});
}

function hash (str) {
	return crypto.createHash('sha256').update(str).digest('base64')
}

function escapeStr (str) {
	return str.replace(singleRe, `''`);
}

async function to_messages (all, file) {
	let lines = all.split(/\r?\n/)
	let line
	let msgs = []
	let msg = ''
	let obj
	let stopped = false

	for (let i =0; i < lines.length; i++) {
		line = lines[i]
		if ((_.startsWith(line, 'From ') && _.startsWith(lines[i + 1], 'From: ')) ||
			(_.startsWith(line, 'Von: ') && (_.startsWith(lines[i + 2], 'Gesendet: ') || _.startsWith(lines[i + 3], 'Gesendet: '))) ||
			line.trim() === GZ_DELIMETER) {
			if (msg !== '') {
				msgs.push(msg + '')
				msg = ''
			}
			if (line.trim() !== GZ_DELIMETER) msg += line + '\n'
		} else {
			msg += line + '\n'
		}
	}

	console.dir(msgs.length)
	//fs.writeFileSync('msg.txt', all, 'utf8')
	//fs.writeFileSync('parsed.json', JSON.stringify(msgs, null, '\t'), 'utf8')
	//process.exit()

	for (let m of msgs) {
		lines = m.split(/\r?\n/)
		obj = {
			date_raw : null,
			date : null,

			original: file,
			response_to : null,
			from_email : null,
			from_name : null,

			subject : null,
			body : null
		}
		stopped = false;
		//console.dir(m)

		for (let l of lines ) {
			try {
				obj.original = file;
				if (!obj.date_raw && _.startsWith(l, 'Date: ')) {
					obj.date_raw = l.replace('Date:', '').trim()
					obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
				}else if (!obj.date_raw && _.startsWith(l, 'Datum: ')) {
					obj.date_raw = l.replace('Datum: ', '').trim()
					obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
				} else if (!obj.subject && _.startsWith(l, 'Subject: ')) {
					obj.subject = l.replace('Subject: ', '').trim()
				} else if (!obj.subject && _.startsWith(l, 'Betreff: ')) {
					obj.subject = l.replace('Betreff: ', '').trim()
				} else if (!obj.from_name && _.startsWith(l, 'From: ')) {
					if (l.indexOf('(') !== -1) {
						obj.from_email = l.replace('From: ', '').trim().split('(')[0].trim()
						obj.from_name = l.replace('From: ', '').trim().split('(')[1].replace(')', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					} else {
						obj.from_email = l.replace('From:', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					}
					obj.id = hash(`${obj.date}-${obj.from_email}`)
				} else if (!obj.from_name && _.startsWith(l, 'An: ')) {
					if (l.indexOf('(') !== -1) {
						obj.from_email = l.replace('An: ', '').trim().split('(')[0].trim()
						obj.from_name = l.replace('An: ', '').trim().split('(')[1].replace(')', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					} else {
						obj.from_email = l.replace('An: ', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					}
					obj.id = hash(`${obj.date}-${obj.from_email}`)
				} else if (!obj.response_to && _.startsWith(l, 'In-Reply-To:')) {
					obj.response_to = l.replace('In-Reply-To:', '').trim()
				}
				if (obj.body === null && _.startsWith(l, 'Message-ID: ')) {
					obj.body = ''
				} else if (typeof obj.body === 'string' && !stopped) {
					//if (_.startsWith(l, 'From:') || _.startsWith('---- Original message ----')) {
						//stopped = true;
					//} else {
						obj.body += l + '\n'
					//}
				}
			} catch (err) {
				console.error(err)
				console.log(m)
				process.exit(1)
			}
		}

		if (obj.date_raw === null) {
			//console.dir(lines)
			continue;
		}
		//console.dir(obj)

		obj.plaintext = '';

		try {
			if (obj.subject) {
				obj.subject = escapeStr(obj.subject)
				obj.plaintext += obj.subject + '\n'
			}
			if (obj.from_name) 	{
				obj.from_name = escapeStr(obj.from_name)
				obj.plaintext += obj.subject + '\n'
			}
			if (obj.body) {
				obj.body = escapeStr(obj.body)
				obj.plaintext += obj.body + '\n'
			}
		} catch (err) {
			console.error('Error escaping', err)
		}

		if (obj.body && obj.body.indexOf('<html>') !== -1 ) {
			try {
				obj.body = await extractText(obj.body)
			} catch (err) {
				console.error(err)
			}
		}
		
		try {
			await messages.insert(obj, true)
			console.log('Inserted', obj.id)
			//console.log(m)
			//if (m.indexOf('Von: ') !== -1 && m.indexOf('> Von:') === -1) process.exit()
		} catch (err) {
			if (err.code === '23505') {
				console.warn('Already exists', obj.id)
				//console.dir(obj.body)
			} else {
				console.error(err)
			}
		}
	}
	return true
	//to_database()
}

async function import_frameworks () {
	console.time('import_frameworks')
	const ARCHIVE = path.join(__dirname, ARCHIVES.frameworks)
	let files = await fs.readdir(ARCHIVE)
	let filePath
	let tmpPath
	let all

	files = files.filter(file => {
		if (file.indexOf('.txt.gz') !== -1) return file
	})

	for (let file of files) {
		filePath = path.join(ARCHIVE, file)
		tmpPath = `/tmp/${+new Date()}.txt`

		try {
			await asyncExec(`gunzip < "${filePath}" > "${tmpPath}"`)
		} catch (err) {
			console.error('Error unzipping file', err)
		}

		try {
			all = await fs.readFile(tmpPath, 'utf8')
			//console.dir(all)
		} catch (err) {
			console.error('Error reading temporary file', err)
		}

		try {
			await to_messages(all, file)
		} catch (err) {
			console.error(err)
		}

		try {
			await fs.unlink(tmpPath)
		} catch (err) {
			console.error(`Error unlinking file ${tmpPath}`)
		}
	}
	console.timeEnd('import_frameworks')
}

async function log_to_messages (all, file) {
	let lines = all.split(/\r?\n/)
	let msgs = []
	let msg = ''
	let delimeter
	let prev
	let obj
	let delimeter_search = lines.find(line => {
		if (line.trim() === LOG_DELIMETER) return line
	})

	if (delimeter_search) {
		delimeter = LOG_DELIMETER
	}

	for (let line of lines) {
		if (delimeter && line.trim() === delimeter && msg !== '') {
			msgs.push(msg + '')
			msg = ''
		} else {
			msg += line + '\n'
		}
	}
	/*
	Date:         Fri, 11 Jan 2002 14:41:20 -0600
	Reply-To:     Experimental Film Discussion List <FRAMEWORKS@LISTSERV.AOL.COM>
	Sender:       Experimental Film Discussion List <FRAMEWORKS@LISTSERV.AOL.COM>
	From:         Chicago Underground Film Festival <info@CUFF.ORG>
	Subject:      Re: Reaping profits a-g film?
	In-Reply-To:  <Pine.NEB.4.40.0201111434390.4927-100000@panix2.panix.com>
	Mime-version: 1.0
	Content-type: text/plain; charset="US-ASCII"
	Content-transfer-encoding: 7bit

	"id" 		: "VARCHAR PRIMARY KEY",
	"original"  : "VARCHAR",

	"date_raw" 	: "VARCHAR",
	"date" 		: "BIGINT",
	
	"response_to" :"VARCHAR",
	"from_email": "VARCHAR",
	"from_name" : "VARCHAR",
	
	"subject" 	: "VARCHAR",
	"body" 		: "VARCHAR",
	"fulltext"  : "TSVECTOR"

	*/
	let count = 0;
	for (let m of msgs) {
		lines = m.split(/\r?\n/)
		obj = {
			date_raw : null,
			date : null,
			original : file,
			response_to : null,
			from_email : null,
			from_name : null,

			subject : null,
			body : null
		}
		for (let l of lines ) {
			try {
				if (!obj.date_raw && _.startsWith(l, 'Date:')) {
					obj.date_raw = l.replace('Date:', '').trim()
					obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
				} else if (!obj.subject && _.startsWith(l, 'Subject:')) {
					obj.subject = l.replace('Subject:', '').trim()
				} else if (!obj.from_name && _.startsWith(l, 'From:')) {
					if (l.indexOf('<') !== -1) {
						obj.from_name = l.replace('From:', '').trim().split('<')[0].trim()
						obj.from_email = l.replace('From:', '').trim().split('<')[1].replace('>', '').trim()
					} else {
						obj.from_email = l.replace('From:', '').trim()
					}
					obj.id = hash(`${obj.date}-${obj.from_email}`)
				} else if (!obj.response_to && _.startsWith(l, 'In-Reply-To:')) {
					obj.response_to = l.replace('In-Reply-To:', '').trim()
				}
				if (obj.body === null && _.startsWith(l.toLowerCase(), 'content-type:')) {
					obj.body = ''
				} else if (typeof obj.body === 'string' && l.indexOf('For info on FrameWorks, contact Pip Chodorov at <PipChod@aol.com>.') === -1 &&
					l.indexOf('__________________________________________________________________') === -1 &&
					!_.startsWith(l.toLowerCase(), 'content-transfer-encoding:')) {
					obj.body += l + '\n'
				}
			} catch (err) {
				console.error(err)
				console.log(m)
				process.exit(1)
			}
		}
		obj.plaintext = '';

		try {
			if (obj.subject) {
				obj.subject = escapeStr(obj.subject)
				obj.plaintext += obj.subject + '\n'
			}
			if (obj.from_name) 	{
				obj.from_name = escapeStr(obj.from_name)
				obj.plaintext += obj.subject + '\n'
			}
			if (obj.body) {
				obj.body = escapeStr(obj.body)
				obj.plaintext += obj.body + '\n'
			}
		} catch (err) {
			console.error('Error escaping', err)
		}

		if (obj.body && obj.body.indexOf('<html>') !== -1 ) {
			try {
				obj.body = await extractText(obj.body)
			} catch (err) {
				console.error(err)
			}
		}

		try {
			//console.dir(obj)
			await messages.insert(obj, true)
			console.log('Inserted', obj.id )
			count++;
		} catch (err) {
			if (err.code === '23505') {
				console.warn('Already exists', obj.id)
				//console.dir(obj.body)
			} else {
				console.error(err)
			}
		}
	}
	console.log(`Inserted ${count} messages`)
	return true
	//to_database();
}

async function extractText (html) {
	return new Promise(async (resolve, reject) =>{
		let filePath = `/tmp/${+new Date()}.html`
		try {
			await fs.writeFile(filePath, html, 'utf8')
		} catch (err) {
			log.error('Error writing file', err)
		}
		textract.fromFileWithPath(filePath, async (err, text ) =>{
			if (err) return reject(err)
			try {
				fs.unlink(filePath)
			} catch (err) {
				log.error('Error erasing tmp file', err)
			}
			return resolve(escapeStr(text))
		})
	})
}

async function import_archiveorg () {
	console.time('import_archiveorg')
	let ARCHIVE = path.join(__dirname, ARCHIVES.archive_org)
	let files = await fs.readdir(ARCHIVE)
	let filePath
	let all

	files = files.filter(file => {
		if (file.indexOf('.txt') !== -1) return file
	})

	for (let file of files) {
		filePath = path.join(ARCHIVE, file);

		try {
			all = await fs.readFile(filePath, 'utf8')
		} catch (err) {
			console.error('Error reading temporary file', err)
		}
		try {
			await log_to_messages(all, file)
		} catch (err) {
			console.error(err);
		}
	}
	console.timeEnd('import_archiveorg')
	process.exit()
}

async function import_hibeam () {
	console.time('import_hibeam')
	let ARCHIVE = path.join(__dirname, ARCHIVES.hi_beam)
	let dirs = await fs.readdir(ARCHIVE)
	let files;
	for (let dir of dirs) {
		files = await fs.readdir(path.join(ARCHIVE, dir))
		
	}
	console.timeEnd('import_hibeam')
}

async function tsvectors () {
	const query = `SELECT id,plaintext FROM messages WHERE fulltext IS NULL;`
	let res
	let message
	let txt
	let tsvQuery

	try {
		res = await messages.query(query)
	} catch (err) {
		console.error(err)
	}

	for (let m of res.rows) {
		try {
			message = await messages.find(`id = '${m.id}'`, true)
		} catch (err) {
			console.error(err)
		}
		
		txt = escapeStr(m.plaintext)
		tsvQuery = `UPDATE messages SET fulltext = to_tsvector('${txt}') WHERE id = '${m.id}';`
		
		try {
			await messages.query(tsvQuery)
			console.log(`Added tsvector data to ${m.id}`)
		} catch (err) {
			console.error(err)
		}
	}
}

async function main () {
	try {
		await messages.connect()
		//await import_frameworks()
		//await import_archiveorg()
		//await import_hibeam();
		//await tsvectors()
	} catch (err) {
		console.error(err);
	}
	process.exit()
}

main();