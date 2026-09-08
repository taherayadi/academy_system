-- Jd. Horaires (studentTimeSheets) is now bundled with the base plan
-- (Scolaire + Finance) at no extra cost. Set its module price to 0 so the
-- automatic monthly price computation for centers excludes it.
UPDATE module_prices SET price = 0 WHERE module_key = 'studentTimeSheets';
