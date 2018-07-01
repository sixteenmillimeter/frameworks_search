'use strict'

//Anticipates the framewors_archiver script is run in a peer
//directory to this project

//https://github.com/sixteenmillimeter/frameworks_archiver

const fs = require('fs-extra');
const _ = require('lodash');
const path = require('path');
const DB = require('dblite');

const messages = new DB('messages');

const ARCHIVE = path.join(__dirname, '../frameworks_archiver');
const LOG_DELIMETER = '=========================================================================';
const YEAR_DELIMETER = ''

async function to_messages (all) {
	let lines = all.split('\n');
	let msgs = [];
	let msg = '';
	let delimeter;
	let prev;
	let delimeter_search = lines.find(line => {
		if (line.trim() === LOG_DELIMETER) return line
	})

	if (delimeter_search) {
		delimeter = LOG_DELIMETER;
	}

	for (let line of lines) {
		
		if (delimeter && line.trim() === delimeter) {
			msgs.push(msg)
			msg = '';
		} else if (!delimeter && _.startsWith('From: ', line)) {
			if (msg !== '') {
				//console.log('----')
				console.log(msg)
				console.log('----BREAK----')
				msgs.push(msg);
			}
			msg = line + '\n';
		} else {
			msg += line + '\n';
		}
		prev = line;
	}
	//console.log(msgs)
	console.dir(msgs.length)
	//to_database();
}

async function import_files () {
	console.time('import_files');
	let files = await fs.readdir(ARCHIVE);
	let filePath;
	let all;
	files = files.filter(file => {
		if (file.indexOf('.txt') !== -1) return file;
	})
	for (let file of files) {
		filePath = path.join(ARCHIVE, file);
		all = await fs.readFile(filePath, 'utf8');
		try {
			await to_messages(all);
		} catch (err) {
			console.error(err);
		}
	}
	console.timeEnd('import_files');
}

import_files();