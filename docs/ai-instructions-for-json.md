# Turning a question paper PDF into a Lakshyam file (with an AI)

**Easiest way:** in the app, Library → Papers → + Add paper → **Copy instructions for AI**.
That copy lists *your own* subjects and topics (including any you added or renamed),
so it is always up to date. This page has the same instructions with the starting
subject and topic list, for reference.

## Steps
1. Open an AI chat (Gemini, ChatGPT, Claude…), attach the question paper PDF
   (and the answer key PDF if you have it).
2. Paste the instructions below and send.
3. Save the JSON it gives you, or copy it.
4. In Lakshyam: + Add paper → Choose file (or paste) → Check → Add paper.
   You see a report before anything is saved; adding the same paper again
   updates it and keeps the answers and explanations you set in the app.

Small mistakes are fine: subject, topic, answer, "deleted by PSC" and
explanation can all be changed on each question inside the app.

A small example file: [sample-paper.json](sample-paper.json) (made-up questions:
a statement question, Malayalam text, stacked maths, an explanation, a question
deleted by PSC and one without an answer yet).

## Instructions to paste
```
You will convert a Kerala PSC question paper PDF into ONE JSON object for the Lakshyam study app.

SHAPE (exactly these field names):
{
  "paper": {
    "id": "<short unique slug, e.g. kpsc-102-2024-m>",
    "name": "<paper code/name as printed, e.g. 102/2024-M>",
    "post_name": "<optional: the post / exam this paper is for>"
  },
  "questions": [
    {
      "id": "q<printed number>",
      "original_number": <optional: printed number, if it differs from the id>,
      "question_text": "<full question, verbatim>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correct_answer_index": <0-based index of the right option, or null if no answer key was given>,
      "deleted_by_psc": <optional: true if the official answer key deleted this question>,
      "subject": "<one subject from the list below, spelled exactly>",
      "topic": "<one topic from that subject's list, spelled exactly, or \"Other\">",
      "explanation": "<optional: only from a reliable source given to you>",
      "difficulty": "<optional: E, M or D, only if the source states it>"
    }
  ]
}

RULES
1. Include every question, in the printed order. Use the printed question number for "id" ("q1", "q2", …).
2. Copy question_text and options word for word. Do not translate, correct or shorten anything; Malayalam stays in Malayalam script.
3. "options" is always a plain list of strings in printed order (usually 4).
4. Never guess the answer. Without an answer key, set "correct_answer_index": null. With a key, match it to the right question number carefully. If the key deletes a question, set "deleted_by_psc": true and "correct_answer_index": null.
5. Skip questions in Hindi, Tamil or Kannada if the paper has them.
6. Maths: plain symbols (÷ × √ ± ≤ ≥ π) are fine for simple things. For fractions, powers or anything stacked, use LaTeX between single dollar signs, e.g. $\\frac{x+3}{7}$. Inside JSON every backslash must be written twice (\\frac, not \frac).
7. **double asterisks** = highlight, *single* = italic. Use only where the printed paper emphasises something.
8. Add "explanation" only when a solutions document was provided. Never invent one; leave the field out instead.
9. "subject" must be exactly one of:
   - History
   - Geography
   - Economics
   - Indian Constitution
   - Kerala Governance & Administration
   - Life Science
   - Physics
   - Chemistry
   - Arts, Literature, Culture, Sports
   - Basics of Computer
   - Important Acts – Education Policy
   - Important Acts – General
   - Current Affairs
   - Simple Arithmetic
   - Mental Ability & Reasoning
   - General English
   - Malayalam
10. "topic" must be exactly one of the topics listed under its subject (copy the spelling, including commas and "&"). If nothing fits, use "Other".
11. Keep "match the following" and multi-statement questions exactly as printed inside question_text (use a new line, \n, between statements).
12. Reply with the JSON only, as a downloadable .json file if you can. No commentary and no code fences inside the file.

TOPICS BY SUBJECT
History:
  - Arrival of Europeans in Kerala
  - Travancore History
  - Social & Religious Reform Movements (Kerala)
  - National Movement in Kerala
  - Literary Sources of Kerala History
  - United Kerala Movement
  - Kerala after 1956
  - Establishment of British Rule
  - First War of Independence 1857
  - Formation of INC
  - Swadeshi Movement
  - Social Reform Movements (India)
  - Freedom Struggle Literature & Press
  - Gandhi & Independence Movement
  - Post-Independence India
  - State Reorganization
  - Science/Education/Tech Development
  - India's Foreign Policy
  - English Revolution
  - American War of Independence
  - French Revolution
  - Russian Revolution
  - Chinese Revolution
  - World History after WWII
  - UNO & International Organizations

Geography:
  - Earth Structure
  - Atmosphere, Pressure Belts & Winds
  - Rocks & Landforms
  - Temperature & Seasons
  - Global Warming & Pollution
  - Maps & Topographic Signs
  - Remote Sensing & GIS
  - Oceans & Ocean Movements
  - Continents & Nations
  - Indian Physiography & States
  - Northern Mountains, Plains & Plateau
  - Indian Rivers
  - Indian Coastal Plains
  - Indian Climate, Vegetation & Agriculture
  - Indian Minerals, Industries & Energy
  - Indian Transport System
  - Kerala Physiography & Districts
  - Kerala Rivers & Climate
  - Kerala Vegetation & Wildlife
  - Kerala Agriculture & Research Centres
  - Kerala Minerals, Industries & Transport

Economics:
  - Indian Economy & Five Year Plans
  - New Economic Reforms
  - Planning Commission & Niti Aayog
  - Financial Institutions
  - Agriculture & Major Crops
  - Green Revolution
  - Minerals
  - Direct & Indirect Taxes
  - GST in India

Indian Constitution:
  - Constituent Assembly & Preamble
  - Citizenship
  - Fundamental Rights
  - Writs
  - Directive Principles
  - Fundamental Duties
  - Union Executive/Parliament/Judiciary
  - State Executive/Legislature/Judiciary
  - Local Self Government
  - Constitutional Amendments
  - CAG
  - Attorney/Advocate General
  - Election Commissions
  - UPSC & State PSC
  - Finance Commissions
  - GST Council
  - Legislative Lists
  - Services under Union & States
  - Tribunals
  - National Commissions (SC/ST/Backward Classes)
  - Official & Regional Languages

Kerala Governance & Administration:
  - Kerala State Civil Service
  - Quasi-Judicial Bodies & Commissions
  - Socio-Economic Development
  - Kerala Planning Board
  - Disaster Management
  - Watershed Management
  - Employment & Labour
  - NREGA-type Programmes
  - Land Reforms
  - Social Welfare & Security
  - Protection of Women/Children/Senior Citizens
  - Population & Literacy
  - E-Governance
  - Delegated Legislation & Controls
  - Administrative Discretion & Adjudication
  - Principles of Natural Justice

Life Science:
  - Human Body Basics
  - Vitamins & Minerals Deficiency Diseases
  - Communicable Diseases
  - Lifestyle Diseases
  - Public Health & Welfare Activities
  - Environment & Environmental Hazards

Physics:
  - Units & Measurements
  - Newton's Laws of Motion
  - Projectile Motion & ISRO Missions
  - Light, Lens & Mirrors
  - Electromagnetic Spectrum
  - Sound & Waves
  - Friction
  - Liquid Pressure & Buoyancy
  - Density & Surface Tension
  - Gravitation & Escape Velocity
  - Satellites
  - Heat & Thermometers
  - Humidity
  - Work, Energy & Power
  - Levers

Chemistry:
  - Atoms, Molecules & States of Matter
  - Gas Laws
  - Periodic Table
  - Metals & Non-metals
  - Chemical Reactions
  - Solutions/Mixtures/Compounds
  - Alloys
  - Acids, Bases & pH
  - Alkaloids

Arts, Literature, Culture, Sports:
  - Kerala Art Forms & Artistes
  - Sports Personalities & Achievements
  - Sports Awards & Trophies
  - Olympics & International Games
  - National Games
  - Malayalam Literary Movements
  - Malayalam Writers & Works
  - Malayalam Journalism History
  - Jnanpith Award Winners
  - Malayalam Cinema
  - Kerala Festivals & Celebrations
  - Kerala Cultural Centres & Leaders

Basics of Computer:
  - Input/Output Devices
  - Memory Devices
  - System & Application Software
  - Operating Systems
  - Word Processors/Spreadsheets/Databases
  - Basics of Programming
  - Computer Networks (LAN/WAN/MAN)
  - Network Devices
  - Internet Services
  - Social Media
  - Web Designing Basics
  - Cyber Wrongs & IT Act 2000

Important Acts – Education Policy:
  - University Education Commission 1948-49
  - Secondary Education Commission 1952-53
  - UGC & UGC Act 1956
  - Kothari Commission 1964-66
  - National Knowledge Commission
  - National Policy on Education 1968
  - National Policy on Education 1986
  - Programme of Action 1992
  - Yashpal Committee 1993
  - National Education Policy 2020

Important Acts – General:
  - RTI Act 2005
  - Kerala Right to Service Act 2012
  - Consumer Protection Act 2019
  - Protection of Civil Rights Act 1955
  - SC/ST Prevention of Atrocities Act 1989
  - Kerala SC/ST Commission Act 2007
  - Protection of Human Rights Act 1993
  - Senior Citizens Maintenance Act 2007
  - Rights of Persons with Disabilities Act 2016
  - Transgender Persons Act 2019
  - Offences Against Women (IPC)
  - Dowry Prohibition Act 1961
  - Women's Commission Acts
  - Domestic Violence Act 2005
  - Sexual Harassment at Workplace Act 2013
  - POCSO Act 2012
  - Juvenile Justice Act 2015
  - Prevention of Corruption Act 1988
  - CVC Act 2003
  - Lokpal/Kerala Lok Ayukta Acts
  - Public Servant Definition (IPC)
  - Administrative Tribunals Act 1985

Current Affairs:
  - National Current Affairs
  - International Current Affairs
  - Kerala Current Affairs
  - Awards & Honours
  - Science & Technology Current Affairs

Simple Arithmetic:
  - Numbers & Basic Operations
  - Fractions & Decimals
  - Percentage
  - Profit & Loss
  - Simple & Compound Interest
  - Ratio & Proportion
  - Time & Distance
  - Time & Work
  - Average
  - Laws of Exponents
  - Mensuration
  - Progressions

Mental Ability & Reasoning:
  - Series
  - Mathematical Signs
  - Verifying Positions
  - Analogy
  - Odd Man Out
  - Numerical Ability
  - Coding & Decoding
  - Family Relations
  - Sense of Direction
  - Time & Angles
  - Clock & Reflections
  - Date & Calendar
  - Clerical Ability

General English:
  - Sentence Types
  - Parts of Speech
  - Subject-Verb Agreement
  - Articles
  - Auxiliary Verbs
  - Question Tags
  - Infinitives & Gerunds
  - Tenses
  - Conditional Sentences
  - Prepositions
  - Correlatives
  - Direct/Indirect Speech
  - Active/Passive Voice
  - Sentence Correction
  - Degrees of Comparison
  - Number/Gender/Collective Nouns
  - Word Formation
  - Compound Words
  - Synonyms & Antonyms
  - Phrasal Verbs
  - Foreign Words & Phrases
  - One Word Substitutes
  - Words Often Confused
  - Spelling
  - Idioms
  - Abbreviations

Malayalam:
  - Padasudhi (Word Purity)
  - Vakyasudhi (Sentence Correction)
  - Paribhasha (Translation)
  - Ottapadam (One Word)
  - Paryayam (Synonyms)
  - Viparitha Padam (Antonyms)
  - Shailikal & Pazhamchollukal (Idioms/Proverbs)
  - Samana Padam (Equivalent Words)
  - Chernezhuthuka (Joining Words)
  - Strilingam/Pullingam (Gender)
  - Vachanam (Number)
  - Piriche Ezhuthal (Separating Words)
  - Ghataka Padam (Compound Words)
```
