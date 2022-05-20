const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
// const res = require('express/lib/response');
require('dotenv').config();
const app = express();


const port = process.env.PORT || 5000;

// middleware
// const corsConfig = {
//     origin: true,
//     credentials: true,
// }
app.use(cors());
// app.options('*', cors(corsConfig));
app.use(express.json());

// AUth

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    if (!authHeader) {
        res.status(401).send({ message: "Unauthorized access" });
    }
    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
    })


}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rifqc.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();

        const serviceCollection = client.db("doctors-portal").collection("services");
        const bookingsCollection = client.db("doctors-portal").collection("bookings");
        const userCollection = client.db("doctors-portal").collection("users");
        const doctorsCollection = client.db("doctors-portal").collection("doctors");

        // Verify Admin

        const verifyAdmin = async (req, res, next) => {
            const requesterEmail = req.decoded.email;
            const query = { email: requesterEmail };
            const requester = await userCollection.findOne(query);
            if (requester.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: "Forbidden Access" })
            }
        }

        // Get Services

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();

            res.send(services);
        })

        // Get all users
        app.get('/users', verifyJWT, async (req, res) => {
            // const query = {};
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        // Check if a user is admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // Make admin

        app.put("/users/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // User Creation
        app.put("/users/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(filter, updateDoc, options);

            const token = jwt.sign({ email: email }, process.env.TOKEN_SECRET, {
                expiresIn: '30d'
            });

            res.send({ result, token });
        })

        // Available Appoinment

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // Get all services
            const services = await serviceCollection.find().toArray();
            // get the booking of the day
            const query = { date: date };
            const bookings = await bookingsCollection.find(query).toArray();
            // for each service, find bookings for that service
            services.forEach(service => {
                // FInd the bokings for the service
                const serviceBookings = bookings.filter(b => b.name === service.name);
                // Select slot for the booking
                const bookedSlots = serviceBookings.map(booking => booking.slot);

                // Create available slots by removing the booked slots from the all slot array. These are the slots not available in the bookedSlots array.
                const available = service.slot.filter(slot => !bookedSlots.includes(slot));
                service.slot = available;
            })

            res.send(services);
        })

        // My Appoinments API
        app.get('/myappoinments', verifyJWT, async (req, res) => {
            const email = req.query.email;

            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const myAppoinments = await bookingsCollection.find(query).toArray();
                return res.send(myAppoinments);
            }
            else {
                return res.status(403).send({ message: "Forbidden Access" });
            }

        })

        // Booking API - Save Bookings on DB
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = { name: booking.name, patientName: booking.patientName, date: booking.date }
            const exists = await bookingsCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send({ success: true, result });
        })

        // Add Doctors

        app.post('/addDoctor', verifyJWT, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })

        // Get All DOctors

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorsCollection.find().toArray();
            res.send(doctors);
        })

        // Delete Doctor

        app.delete('/deleteDoctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorsCollection.deleteOne(filter);

            res.send(result);
        })

    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("Server is running")
})

app.listen(port, () => {
    console.log("Doctors Portal Server on PORT: ", port);
})
