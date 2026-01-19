
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars manually since we're running as a standalone script
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const OLD_PROJECT_ID = 'dmbnstbteqlhxyczlcst';
// Extract new project ID from URL (e.g. https://glexdzzmdkqpfbqqffyw.supabase.co -> glexdzzmdkqpfbqqffyw)
const NEW_PROJECT_ID = new URL(SUPABASE_URL).hostname.split('.')[0];

console.log(`Migrating URLs from project ${OLD_PROJECT_ID} to ${NEW_PROJECT_ID}...`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fixResourceUrls() {
    // Fetch all resources that contain the old project ID
    const { data: resources, error } = await supabase
        .from('resources')
        .select('*')
        .ilike('file_url', `%${OLD_PROJECT_ID}%`);

    if (error) {
        console.error('Error fetching resources:', error);
        return;
    }

    console.log(`Found ${resources.length} resources with old URLs.`);

    for (const resource of resources) {
        const oldUrl = resource.file_url;
        const newUrl = oldUrl.replace(OLD_PROJECT_ID, NEW_PROJECT_ID);

        console.log(`Updating resource ${resource.id}:`);
        console.log(`  Old: ${oldUrl}`);
        console.log(`  New: ${newUrl}`);

        const { error: updateError } = await supabase
            .from('resources')
            .update({ file_url: newUrl })
            .eq('id', resource.id);

        if (updateError) {
            console.error(`  Failed to update resource ${resource.id}:`, updateError);
        } else {
            console.log(`  Success!`);
        }
    }

    console.log('Migration complete.');
}

fixResourceUrls();
