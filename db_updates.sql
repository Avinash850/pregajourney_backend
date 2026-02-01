ALTER TABLE hospitals
ADD COLUMN show_call_button TINYINT(1) DEFAULT 0;


ALTER TABLE clinics
ADD COLUMN show_call_button TINYINT(1) DEFAULT 0;