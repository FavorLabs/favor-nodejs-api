const fs = require('fs')
const mongoose = require('mongoose')
const colors = require('colors')
const dotenv = require('dotenv')
const { customAlphabet } = require('nanoid/async')

// Load env vars
dotenv.config({ path: './config/.env' })

const S = require('./models/Subscription')
const User = require('./models/User')
const Category = require('./models/Category')

mongoose.connect(process.env.MONGO_URI, {
	useNewUrlParser: true,
	useCreateIndex: true,
	useFindAndModify: false,
	useUnifiedTopology: true,
})

const users = JSON.parse(
	fs.readFileSync(`${__dirname}/_data/users.json`, 'utf-8')
)
const categories = JSON.parse(
	fs.readFileSync(`${__dirname}/_data/categories.json`, 'utf-8')
)

const importData = async () => {
	try {
		// await User.create(users)
		await Category.create(categories)

		console.log('Data Imported...'.green.inverse)
		process.exit()
	} catch (err) {
		console.error(err)
	}
}

const deleteData = async () => {
	try {
		// await User.deleteMany()
		await Category.deleteMany()

		console.log('Data Destroyed...'.red.inverse)
		process.exit()
	} catch (err) {
		console.error(err)
	}
}

const code = async () => {
	try {
		const nanoid = customAlphabet('6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz', 10)
		let users = await User.find({code:{$exists:false}})
		let bulk = await Promise.all(users.map(async item=>{
			let code = await nanoid()
			return { updateOne :
					{
						"filter": {_id : item._id},
						"update":{
							$set:{
								code: code
							}
						},
						"upsert": false
					}
			}
		}))

		await User.bulkWrite(bulk);
		console.log('Code updated...'.red.inverse)
		process.exit()
	} catch (err) {
		console.error(err)
	}
}

const initView = async () =>{
	try {
		// await User.deleteMany()
		await mongoose.connection.dropCollection("videolists");
		await mongoose.connection.createCollection(
			"videolists",
			{viewOn:"videos",
			pipeline:[     {
				"$lookup": {
					"from": "users",
					"localField": "userId",
					"foreignField": "_id",
					"as": "user"
				}
			},
				{
					"$unwind": "$user"
				} ]}
		)

		process.exit()
	} catch (err) {
		console.error(err)
	}
}

if (process.argv[2] === '-i') {
	// node seeder -i
	importData()
} else if (process.argv[2] === '-d') {
	// node seeder -d
	deleteData()
} else if (process.argv[2] === '-v') {
	// node seeder -v
	initView()
}else if (process.argv[2] === '-c') {
	// node seeder -c
	code()
}else {
	process.exit()
}
