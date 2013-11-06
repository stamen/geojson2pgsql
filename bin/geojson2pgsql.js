#!/usr/bin/env node

"use strict";

var path = require("path"),
    util = require("util");

var env = require("require-env"),
    pg = require("pg");

var optimist = require('optimist')
      .usage("Usage: $0 [<options>] <GeoJSON file> [[schema.]<table>]"),
    argv = optimist.argv;

if (argv._.length < 1) {
  optimist.showHelp();
  process.exit(1);
}

var getFeatures = function(data) {
  switch (data.type) {
  case "FeatureCollection":
    return data.features;

  case "Feature":
    return [data];

  default:
    throw new Error("Unsupported GeoJSON type: " + data.type);
  }
};

var getType = function(val) {
  switch (typeof(val)) {
  case "number":
    return "numeric";

  case "string":
    return "varchar";

  default:
    throw new Error("Unsupported type: " + typeof(val));
  }
};

var getDimensionality = function(geometry) {
  switch (geometry.type) {
  case "LineString":
    return geometry.coordinates[0].length;

  case "Point":
    return geometry.coordinates.length;

  default:
    throw new Error("Unsupported GeoJSON geometry type: " + geometry.type);
  }
};

var getGeometryType = function(geometry) {
  var dimensionality = getDimensionality(geometry);

  switch (dimensionality) {
  case 2:
    return geometry.type;

  case 3:
    // TODO allow an option to make this '<type>M'
    return geometry.type + "Z";

  case 4:
    return geometry.type + "ZM";

  default:
    throw new Error("Unsupported number of dimensions: " + dimensionality);
  }
};

var asWKT = function(geometry, srid) {
  switch (geometry.type) {
  case "LineString":
    return util.format("SRID=%d;LINESTRING(%s)", srid, geometry.coordinates.map(function(x) {
      return x.join(" ");
    }).join(","));

  case "Point":
    return util.format("SRID=%d;Point(%s)", srid, geometry.coordinates.join(" "));

  default:
    throw new Error("Unsupported GeoJSON geometry type: " + geometry.type);
  }
};

var source = argv._.shift(),
    target = argv._.shift() || path.basename(source, path.extname(source));

// TODO special-case '-' for stdin
var data = require(path.join(process.cwd(), source));

var sampleFeature = getFeatures(data)[0];

var idType = getType(sampleFeature.id),
    geometryType = getGeometryType(sampleFeature.geometry),
    srid = 4326; // TODO make this configurable, sample it from the features list

var client = new pg.Client(env.require("DATABASE_URL"));

client.connect(function(err) {
  if (err) {
    throw err;
  }
});

client.on("drain", function() {
  console.log("drained.");
  setImmediate(process.exit);
});

// TODO don't always do this
client.query(util.format("DROP TABLE IF EXISTS %s", target));
client.query(util.format("CREATE TABLE %s (id %s NOT NULL, properties JSON, geom GEOMETRY(%s, %d), PRIMARY KEY(id))",
                                target, // TODO sanitize
                                idType,
                                geometryType,
                                srid), function(err) {
  if (err) {
    console.warn(err);
  }
});

var insertQuery = util.format("INSERT INTO %s (id, properties, geom) VALUES ($1, $2, $3)", target);

getFeatures(data).forEach(function(feature) {
  var params = [
    feature.id,
    feature.properties,
    asWKT(feature.geometry, srid)
  ];

  client.query(insertQuery, params, function(err) {
    if (err) {
      console.warn(err);
    }
  });
});
