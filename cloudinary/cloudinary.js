require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_APIKEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    // secure_distribution: 'mydomain.com',
    // upload_prefix: 'myprefix.com'
});

module.exports = cloudinary