#!/usr/bin/env python3
"""Start the Flask server with proper environment loading."""

import os
import sys

if __name__ == "__main__":
    # Debug: Check actual values
    database_url = os.environ.get('DATABASE_URL', '')
    pghost = os.environ.get('PGHOST', '')
    pgdatabase = os.environ.get('PGDATABASE', '')
    
    print(f"DATABASE_URL length: {len(database_url)}")
    print(f"PGHOST: '{pghost}'")
    print(f"PGDATABASE: '{pgdatabase}'")
    
    if database_url and len(database_url) > 10:
        print(f"Database URL found: {database_url[:50]}...")
    elif pghost and pgdatabase:
        print(f"Using individual PG vars: host={pghost}, db={pgdatabase}")
    else:
        print("WARNING: No database connection info available!")
        print("DATABASE_URL is empty or not set properly")
    
    # Start gunicorn
    os.system("gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app")
