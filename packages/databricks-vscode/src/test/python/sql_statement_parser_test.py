import sys
sys.dont_write_bytecode = True
import os
import unittest

# Add the resources directory to the path so we can import the parser
resources_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../resources/python'))
sys.path.append(resources_dir)

# Import the parser from the init file
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location("init_module", os.path.join(resources_dir, "00-databricks-init.py"))
init_module = module_from_spec(spec)
spec.loader.exec_module(init_module)
SqlStatementParser = init_module.SqlStatementParser

class TestSqlStatementParser(unittest.TestCase):
    def test_simple_statements(self):
        sql = "SELECT * FROM table1; SELECT * FROM table2;"
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 2)
        self.assertEqual(statements[0], "SELECT * FROM table1")
        self.assertEqual(statements[1], "SELECT * FROM table2")

    def test_statements_with_whitespace(self):
        sql = "SELECT * FROM table1;  \n  SELECT * FROM table2 "
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 2)
        self.assertEqual(statements[0], "SELECT * FROM table1")
        self.assertEqual(statements[1], "SELECT * FROM table2")

    def test_statement_without_semicolon(self):
        sql = "SELECT * FROM table1"
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 1)
        self.assertEqual(statements[0], "SELECT * FROM table1")

    def test_empty_statements(self):
        sql = ";;;"
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 0)

    def test_semicolons_in_line_comments(self):
        sql = """
        SELECT * FROM table1; -- This is a comment
        -- This is another comment with ';' in it (or just ;)
        SELECT * FROM table2;
        """
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 2)
        self.assertEqual("SELECT * FROM table1", statements[0])
        stm2 = """-- This is a comment
        -- This is another comment with ';' in it (or just ;)
        SELECT * FROM table2"""
        self.assertEqual(stm2, statements[1])

    def test_semicolons_in_block_comments(self):
        sql = """
        SELECT * FROM table1; /* This is a 
        multiline comment with ";" in it (;) */
        SELECT * FROM table2;
        """
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 2)
        self.assertEqual("SELECT * FROM table1", statements[0])
        stm2 = """/* This is a 
        multiline comment with ";" in it (;) */
        SELECT * FROM table2"""
        self.assertIn(stm2, statements[1])

    def test_semicolons_in_strings(self):
        sql = """
        SELECT * FROM table1 WHERE name = 'John; Smith';
        SELECT * FROM table2 WHERE id = "123; 456";
        SELECT * FROM `table; name` WHERE `column; name` = 1;
        """
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 3)
        self.assertEqual("SELECT * FROM table1 WHERE name = 'John; Smith'", statements[0])
        self.assertEqual('SELECT * FROM table2 WHERE id = "123; 456"', statements[1])
        self.assertEqual('SELECT * FROM `table; name` WHERE `column; name` = 1', statements[2])

    def test_escaped_quotes(self):
        sql = """
        SELECT * FROM table1 WHERE text = 'Don\\'t; forget; the semicolon;';
        SELECT * FROM table2 WHERE message = "Say \\"Hello;\\"";
        """
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 2)
        self.assertEqual("SELECT * FROM table1 WHERE text = 'Don\\'t; forget; the semicolon;'", statements[0])
        self.assertEqual('SELECT * FROM table2 WHERE message = "Say \\"Hello;\\""', statements[1])

    def test_complex_sql(self):
        sql = """
        /* Initial setup */
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(255)
        );
        
        -- Insert some data
        INSERT INTO users VALUES (1, 'John\\'s; Doe;', 'john@example.com');
        INSERT INTO users VALUES (2, 'Jane Smith', 'jane@example.com');
        
        /* Run a query with a semicolon in a string */
        SELECT * FROM users WHERE email LIKE '%.com;%' OR name = 'Test; User';
        """
        parser = SqlStatementParser(sql)
        statements = parser.parse()
        self.assertEqual(len(statements), 4)

if __name__ == '__main__':
    unittest.main()
