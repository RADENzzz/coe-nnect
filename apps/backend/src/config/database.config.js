"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
exports.createDataSourceOptions = createDataSourceOptions;
var typeorm_1 = require("typeorm");
function createDataSourceOptions(config) {
    return {
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [__dirname + '/../modules/**/entities/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        synchronize: false, // NEVER true — schema is managed by Supabase SQL
        logging: config.get('NODE_ENV') === 'development',
        ssl: { rejectUnauthorized: false },
    };
}
// Standalone DataSource for TypeORM CLI (migrations, seeds)
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ['src/modules/**/entities/*.entity.ts'],
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
    ssl: { rejectUnauthorized: false },
});
