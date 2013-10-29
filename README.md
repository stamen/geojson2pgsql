# geojson2pgsql

When `ogr2ogr` isn't enough. Imports GeoJSON into PostgreSQL, using features'
`id` as the primary key, their geometry as a PostGIS geometry, and their
`properties` as a JSON column.

Requires PostgreSQL 9.2 for JSON storage, 9.3 for meaningful query
functionality.

## Usage

Import `data.json` into a `data` table and display keys present in
`properties`.

```bash
createdb json-test
psql -d json-test -c "create extension postgis"
DATABASE_URL=postgres://localhost/json-test geojson2pgsql data.json data
psql -d json-test -c "select json_object_keys(properties) from data"
```

## Environment Variables

* `DATABASE_URL` - Postgres connection info. Required.
