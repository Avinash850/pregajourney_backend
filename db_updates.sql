ALTER TABLE doctors 
ADD COLUMN is_profile_claimed TINYINT(1) DEFAULT 0;

ALTER TABLE doctors 
ADD COLUMN patients_count INT DEFAULT 0;


CREATE TABLE clinic_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clinic_id INT NOT NULL,
  image_url TEXT NOT NULL,
  image_key TEXT,
  sort_order INT DEFAULT 0,
  created_at VARCHAR(45) DEFAULT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
);


CREATE TABLE hospital_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_id INT NOT NULL,
  image_url TEXT NOT NULL,
  image_key TEXT,
  sort_order INT DEFAULT 0,
  created_at VARCHAR(45) DEFAULT NULL,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
);




ALTER TABLE clinics 
ADD COLUMN rating DECIMAL(3,2) DEFAULT 0.00;


ALTER TABLE doctor_clinic 
ADD COLUMN is_on_call TINYINT(1) DEFAULT 0;

ALTER TABLE doctor_hospital
ADD COLUMN is_on_call TINYINT(1) DEFAULT 0 AFTER is_primary;

ALTER TABLE pregajourney.hospitals
ADD COLUMN is_profile_claimed TINYINT(1) DEFAULT 0,
ADD COLUMN patients_count INT DEFAULT 0,
ADD COLUMN rating DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN patients_stories INT DEFAULT 0;

ALTER TABLE pregajourney.clinics
ADD COLUMN is_profile_claimed TINYINT(1) DEFAULT 0,
ADD COLUMN patients_count INT DEFAULT 0,
ADD COLUMN patients_stories INT DEFAULT 0;


ALTER TABLE `pregajourney`.`hospitals` 
ADD COLUMN `payment_type` INT NULL DEFAULT 0 AFTER `patients_stories`;


ALTER TABLE `pregajourney`.`clinics` 
ADD COLUMN `payment_type` INT NULL DEFAULT 0 AFTER `patients_stories`;

ALTER TABLE `pregajourney`.`hospitals` 
ADD COLUMN `designation` VARCHAR(255) NULL AFTER `payment_type`;



INSERT INTO `pregajourney`.`specializations` (`id`, `name`, `slug`) VALUES ('15', 'Urologist', 'urologist');
INSERT INTO `pregajourney`.`specializations` (`id`, `name`, `slug`) VALUES ('16', 'Otolaryngologist', 'otolaryngologist');
INSERT INTO `pregajourney`.`procedures` (`id`, `name`, `slug`) VALUES ('35', 'Aesthetic', 'aesthetic');




UPDATE symptoms SET slug = 'pap-smear' WHERE id = 1;
UPDATE symptoms SET slug = 'pelvic-exam' WHERE id = 2;
UPDATE symptoms SET slug = 'breast-exam' WHERE id = 3;
UPDATE symptoms SET slug = 'menstrual-disorders-treatment' WHERE id = 4;
UPDATE symptoms SET slug = 'pcos-management' WHERE id = 5;
UPDATE symptoms SET slug = 'endometriosis-treatment' WHERE id = 6;
UPDATE symptoms SET slug = 'uterine-fibroid-management' WHERE id = 7;
UPDATE symptoms SET slug = 'antenatal-care' WHERE id = 8;
UPDATE symptoms SET slug = 'high-risk-pregnancy-management' WHERE id = 9;
UPDATE symptoms SET slug = 'labor-and-delivery' WHERE id = 10;
UPDATE symptoms SET slug = 'cesarean-section' WHERE id = 11;
UPDATE symptoms SET slug = 'hysteroscopy' WHERE id = 12;
UPDATE symptoms SET slug = 'laparoscopy' WHERE id = 13;
UPDATE symptoms SET slug = 'myomectomy' WHERE id = 14;
UPDATE symptoms SET slug = 'tuboplasty-tubal-recanalization' WHERE id = 15;
UPDATE symptoms SET slug = 'clomiphene-citrate-clomid-therapy' WHERE id = 16;
UPDATE symptoms SET slug = 'letrozole-therapy' WHERE id = 17;
UPDATE symptoms SET slug = 'gonadotropin-injections' WHERE id = 18;
UPDATE symptoms SET slug = 'hmg-fsh-therapy' WHERE id = 19;
UPDATE symptoms SET slug = 'gnrh-agonists-antagonists' WHERE id = 20;
UPDATE symptoms SET slug = 'metformin-therapy' WHERE id = 21;
UPDATE symptoms SET slug = 'progesterone-supplementation' WHERE id = 22;
UPDATE symptoms SET slug = 'dopamine-agonists' WHERE id = 23;
UPDATE symptoms SET slug = 'intrauterine-insemination-iui' WHERE id = 24;
UPDATE symptoms SET slug = 'in-vitro-fertilization-ivf' WHERE id = 25;
UPDATE symptoms SET slug = 'intracytoplasmic-sperm-injection-icsi' WHERE id = 26;
UPDATE symptoms SET slug = 'frozen-embryo-transfer-fet' WHERE id = 27;
UPDATE symptoms SET slug = 'tuboplasty-tubal-recanalization' WHERE id = 28;
UPDATE symptoms SET slug = 'polypectomy' WHERE id = 29;
UPDATE symptoms SET slug = 'adhesiolysis' WHERE id = 30;
UPDATE symptoms SET slug = 'ovarian-cystectomy' WHERE id = 31;
UPDATE symptoms SET slug = 'endometriosis-surgery' WHERE id = 32;
UPDATE symptoms SET slug = 'ovarian-drilling' WHERE id = 33;
UPDATE symptoms SET slug = 'egg-donation' WHERE id = 34;
UPDATE symptoms SET slug = 'embryo-donation' WHERE id = 35;
UPDATE symptoms SET slug = 'oocyte-cryopreservation' WHERE id = 36;
UPDATE symptoms SET slug = 'embryo-cryopreservation' WHERE id = 37;
UPDATE symptoms SET slug = 'surrogacy' WHERE id = 38;
UPDATE symptoms SET slug = 'thyroid-therapy' WHERE id = 39;
UPDATE symptoms SET slug = 'hyperprolactinemia-treatment' WHERE id = 40;
UPDATE symptoms SET slug = 'immunotherapy' WHERE id = 41;
UPDATE symptoms SET slug = 'antibiotics-infection-treatment' WHERE id = 42;
UPDATE symptoms SET slug = 'lifestyle-nutrition' WHERE id = 43;
UPDATE symptoms SET slug = 'nutritional-supplements' WHERE id = 44;


INSERT INTO symptoms (name, slug) VALUES
('Period doubts or Pregnancy', 'period_pregnancy'),
('Acne, pimple or skin issues', 'skin_issues'),
('Performance issues in bed', 'sexual_performance_issues'),
('Cold, cough or fever', 'cold_cough_fever'),
('Child not feeling well', 'child_unwell'),
('Depression or anxiety', 'depression_anxiety');


INSERT INTO search_intents (keyword, entity_type, entity_id, priority, status) VALUES
('specializations', 'specialization', NULL, 100, 1),
('symptoms', 'symptom', NULL, 100, 1),
('services', 'service', NULL, 100, 1),
('procedures', 'procedure', NULL, 100, 1);


INSERT INTO `pregajourney`.`areas` (`id`, `name`, `city_id`, `zone`) VALUES ('35', 'Model Town', '130', 'Jalandhar');


ALTER TABLE `pregajourney`.`doctors` 
ADD COLUMN `gender` VARCHAR(45) NULL AFTER `patients_count`;



UPDATE pregajourney.doctors
SET gender = 'female'
WHERE id IN (23,27,28,29,30,34,36,37,38,40,42,46);

UPDATE pregajourney.doctors
SET gender = 'male'
WHERE id NOT IN (23,27,28,29,30,34,36,37,38,40,42,46);

ALTER TABLE doctors
CHANGE COLUMN experience_years experience_years INT NULL DEFAULT 0,
CHANGE COLUMN gender gender VARCHAR(45) NULL DEFAULT 'male';


ALTER TABLE doctors
ADD COLUMN doctor_college VARCHAR(255) NULL,
ADD COLUMN pass_year YEAR NULL,
ADD COLUMN doctor_council VARCHAR(255) NULL,
ADD COLUMN doctor_council_year YEAR NULL;
