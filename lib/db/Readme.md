<a name="module_db"></a>

## db

* [db](#module_db)
    * [~DB](#module_db..DB)
        * [new DB(name)](#new_module_db..DB_new)
        * [._createTable()](#module_db..DB+_createTable)
        * [._describeTable()](#module_db..DB+_describeTable)
        * [._compareFields(master, current)](#module_db..DB+_compareFields)
        * [._alterField(obj, Alter)](#module_db..DB+_alterField)
        * [._alterTable(fields, silent)](#module_db..DB+_alterTable)
        * [._wipeTable()](#module_db..DB+_wipeTable)
        * [.insert(obj, silent)](#module_db..DB+insert) ⇒ <code>function</code>
        * [.update(where, obj, silent)](#module_db..DB+update) ⇒ <code>function</code>
        * [.list(silent)](#module_db..DB+list) ⇒ <code>function</code>
        * [.find(where, silent)](#module_db..DB+find) ⇒ <code>function</code>
        * [.delete(where, silent)](#module_db..DB+delete) ⇒ <code>function</code>
        * [.query(query)](#module_db..DB+query) ⇒ <code>function</code>
        * [.prepared(query, data)](#module_db..DB+prepared) ⇒ <code>function</code>
    * [~Pool](#module_db..Pool)

<a name="module_db..DB"></a>

### db~DB
Class representing a database connection

**Kind**: inner class of [<code>db</code>](#module_db)  

* [~DB](#module_db..DB)
    * [new DB(name)](#new_module_db..DB_new)
    * [._createTable()](#module_db..DB+_createTable)
    * [._describeTable()](#module_db..DB+_describeTable)
    * [._compareFields(master, current)](#module_db..DB+_compareFields)
    * [._alterField(obj, Alter)](#module_db..DB+_alterField)
    * [._alterTable(fields, silent)](#module_db..DB+_alterTable)
    * [._wipeTable()](#module_db..DB+_wipeTable)
    * [.insert(obj, silent)](#module_db..DB+insert) ⇒ <code>function</code>
    * [.update(where, obj, silent)](#module_db..DB+update) ⇒ <code>function</code>
    * [.list(silent)](#module_db..DB+list) ⇒ <code>function</code>
    * [.find(where, silent)](#module_db..DB+find) ⇒ <code>function</code>
    * [.delete(where, silent)](#module_db..DB+delete) ⇒ <code>function</code>
    * [.query(query)](#module_db..DB+query) ⇒ <code>function</code>
    * [.prepared(query, data)](#module_db..DB+prepared) ⇒ <code>function</code>

<a name="new_module_db..DB_new"></a>

#### new DB(name)
Initialized connection to database and create client.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | Table name to connect to |

<a name="module_db..DB+_createTable"></a>

#### dB._createTable()
Create an empty, column-less table and invoke this._describeTable().

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
<a name="module_db..DB+_describeTable"></a>

#### dB._describeTable()
Query the table description and build an array of columns to alter.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
<a name="module_db..DB+_compareFields"></a>

#### dB._compareFields(master, current)
Query the table description and build an array of columns to alter.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  

| Param | Type | Description |
| --- | --- | --- |
| master | <code>Array</code> | Array of columns to compare |
| current | <code>Object</code> | Response from query |

<a name="module_db..DB+_alterField"></a>

#### dB._alterField(obj, Alter)
Generate ALTER statement to either ADD or DROP column.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | Object containing alter information |
| Alter | <code>String</code> | table query |

<a name="module_db..DB+_alterTable"></a>

#### dB._alterTable(fields, silent)
Generate and combine all ALTER statements and apply to the 
table with query.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| fields | <code>Array</code> |  | Array of objects from comparing current to master. |
| silent | <code>Boolean</code> | <code>true</code> | Whether or not to hide log statements from console |

<a name="module_db..DB+_wipeTable"></a>

#### dB._wipeTable()
Drop the table associated with the class.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
<a name="module_db..DB+insert"></a>

#### dB.insert(obj, silent) ⇒ <code>function</code>
Insert record into table associated with class. Returns a promise.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| obj | <code>Object</code> |  | All values to insert |
| silent | <code>Boolean</code> | <code>true</code> | Whether or not to hide log statements from console |

<a name="module_db..DB+update"></a>

#### dB.update(where, obj, silent) ⇒ <code>function</code>
Insert record into table associated with class. Returns a promise.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| where | <code>String</code> |  | WHERE statement to select rows to update |
| obj | <code>Object</code> |  | All values to update in row |
| silent | <code>Boolean</code> | <code>true</code> | Whether or not to hide log statements from console |

<a name="module_db..DB+list"></a>

#### dB.list(silent) ⇒ <code>function</code>
List all records from table associated with the class.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| silent | <code>Boolean</code> | <code>true</code> | Whether or not to hide log statements from console |

<a name="module_db..DB+find"></a>

#### dB.find(where, silent) ⇒ <code>function</code>
List all records from table associated with the class that match
the supplied WHERE statement.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| where | <code>String</code> |  | WHERE statement of rows to return |
| silent | <code>Boolean</code> | <code>false</code> | Whether or not to hide log statements from console |

<a name="module_db..DB+delete"></a>

#### dB.delete(where, silent) ⇒ <code>function</code>
Perform a DELETE statement WHERE constraint is satisfied.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| where | <code>String</code> |  | WHERE statement of rows to return |
| silent | <code>Boolean</code> | <code>false</code> | Whether or not to hide log statements from console |

<a name="module_db..DB+query"></a>

#### dB.query(query) ⇒ <code>function</code>
Open-ended query statment. Opens connection to the pool, gets a client  then closes
the client.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Description |
| --- | --- | --- |
| query | <code>String</code> | Query statement to run |

<a name="module_db..DB+prepared"></a>

#### dB.prepared(query, data) ⇒ <code>function</code>
Query using repared statements.

**Kind**: instance method of [<code>DB</code>](#module_db..DB)  
**Returns**: <code>function</code> - Promise of query  

| Param | Type | Description |
| --- | --- | --- |
| query | <code>String</code> | A prepared statement to run |
| data | <code>Array</code> | Array of values |

<a name="module_db..Pool"></a>

### db~Pool
General purpose SQL db library for Postgres and sqlite3 alternatively. Used for prototyping and then deployment.

**Kind**: inner property of [<code>db</code>](#module_db)  
