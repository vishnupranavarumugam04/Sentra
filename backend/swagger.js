const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sentra Crisis Reporting API',
      version: '1.0.0',
      description: 'Open REST API for the UNDP RAPIDA crowdsourced damage assessment platform. Supports GIS integration via GeoJSON, Shapefile, and CSV exports.',
      contact: {
        name: 'Sentra Team'
      },
      license: {
        name: 'MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./routes/*.js'] // path to the API docs
};

const specs = swaggerJsDoc(options);

module.exports = {
  swaggerUi,
  specs
};
