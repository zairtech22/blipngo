// middleware/basicAuth.js
const auth = require('basic-auth');

module.exports = (req, res, next) => {
  const creds = auth(req);
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (!creds || creds.name !== user || creds.pass !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required.');
  }
  next();
};
