import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ContentRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.questions = json.loads(
            (ROOT / "data" / "questions.json").read_text(encoding="utf-8")
        )["questions"]
        cls.concepts_data = json.loads(
            (ROOT / "data" / "concepts.json").read_text(encoding="utf-8")
        )
        cls.concepts = [
            concept
            for category in cls.concepts_data["categories"]
            for subcategory in category["subCategories"]
            for concept in subcategory["concepts"]
        ]
        cls.concepts_by_title = {
            concept["title"]: concept for concept in cls.concepts
        }
    def correct_answer(self, index):
        question = self.questions[index]
        return question["options"][question["answerIndex"]]

    def concept_text(self, title):
        concept = self.concepts_by_title[title]
        return "\n".join(
            [concept["body"], concept["summary"], *concept["examPoints"]]
        )

    def test_question_bank_structure(self):
        self.assertEqual(244, len(self.questions))
        question_texts = [question["question"] for question in self.questions]
        self.assertEqual(len(question_texts), len(set(question_texts)))

        subcategory_ids = {
            subcategory["subCategoryKey"]
            for category in self.concepts_data["categories"]
            for subcategory in category["subCategories"]
        }
        for question in self.questions:
            self.assertEqual(4, len(question["options"]), question["question"])
            self.assertIn(question["answerIndex"], range(4), question["question"])
            self.assertIn(question["subCategory"], subcategory_ids, question["question"])

    def test_practical_hair_guidance_avoids_unverified_fixed_values(self):
        test_curl = self.questions[3]
        self.assertEqual("테스트 컬 (Test Curl)", self.correct_answer(3))
        self.assertNotIn("1.5~2바퀴", test_curl["question"] + test_curl["explanation"])

        flat_iron = self.questions[119]
        marcel = self.questions[120]
        self.assertIn("모발 상태와 디자인", self.correct_answer(119))
        self.assertIn("모발 상태와 디자인", self.correct_answer(120))
        self.assertNotIn("160~180", flat_iron["question"] + flat_iron["explanation"])
        self.assertNotIn("120~140", marcel["question"] + marcel["explanation"])

        iron_concept = self.concept_text("매직스트레이트와 헤어 아이론(마셀 웨이브)")
        self.assertIn("제품 지침", iron_concept)
        self.assertNotIn("시술 후 24~48시간", iron_concept)

        aftercare = self.questions[121]
        self.assertIn("제품 지침", self.correct_answer(121))
        self.assertNotIn("24~48시간", aftercare["question"] + " ".join(aftercare["options"]) + aftercare["explanation"])

    def test_nessler_history_distinguishes_demonstration_and_patent(self):
        nessler = self.questions[89]
        text = nessler["question"] + nessler["explanation"]
        self.assertEqual("찰스 네슬러", self.correct_answer(89))
        self.assertIn("1905년", text)
        self.assertIn("1909년", text)
        concept = self.concept_text("서양 미용의 역사와 웨이브 발달사")
        self.assertIn("1905년 영구웨이브 기계 시연", concept)
        self.assertIn("1909년", concept)
        self.assertIn("특허", concept)
        self.assertIn("국내 미용사(일반) 시험 자료", concept)

        speakman = self.questions[90]
        self.assertIn("국내 미용사(일반) 시험 자료", speakman["question"] + speakman["explanation"])

    def test_hair_shaft_treatment_is_temporary_physical_conditioning(self):
        treatment = self.questions[105]
        text = treatment["question"] + " ".join(treatment["options"]) + treatment["explanation"]
        self.assertIn("일시적으로", self.correct_answer(105))
        self.assertIn("각화된 비생물성", treatment["explanation"])
        self.assertNotIn("근본적으로 보강", text)

        for title in (
            "헤어 트리트먼트와 두피 관리(스캘프 트리트먼트)",
            "화장품의 분류 (3) 모발화장품",
        ):
            concept = self.concept_text(title)
            self.assertIn("일시적으로", concept)
            self.assertNotIn("근본적으로 보강", concept)
            self.assertNotIn("내부 영양공급", concept)

    def test_hair_follicle_wording_separates_papilla_matrix_and_shaft(self):
        for title in ("모발의 구조와 성장 주기", "피부의 부속기관 ① - 모발"):
            concept = self.concept_text(title)
            self.assertIn("성장하는 모낭", concept)
            self.assertIn("모기질", concept)
            self.assertIn("멜라닌세포", concept)
            self.assertNotIn("모발에 영양을 공급", concept)

        skin_appendage = self.concept_text("피부의 부속기관 ① - 모발")
        self.assertIn("모기질세포(모모세포)", skin_appendage)

        growth_cycle = self.concept_text("모발의 구조와 성장 주기")
        self.assertNotIn("발생기", growth_cycle)
        self.assertNotIn("단열재처럼 보온", growth_cycle)
        self.assertNotIn("모수질(보온)", growth_cycle)
        self.assertIn("기능은 명확하지 않", growth_cycle)
        self.assertNotIn("모표피는 순수 보호 기능", growth_cycle)

    def test_perm_product_check_and_dye_patch_test_are_distinguished(self):
        perm = self.questions[118]
        self.assertIn("두피·모발 상태", self.correct_answer(118))
        self.assertIn("시험 사용", self.correct_answer(118))
        self.assertIn("테스트 컬", self.correct_answer(118))
        self.assertNotIn("매회 48시간 피부 패취테스트", self.correct_answer(118))

        perm_concept = self.concept_text("퍼머넌트 웨이브의 화학적 원리")
        self.assertIn("모발 일부에 시험 사용", perm_concept)
        self.assertNotIn("필요한 경우 패치 테스트", perm_concept)

        patch = self.questions[132]
        patch_text = patch["question"] + patch["explanation"]
        self.assertEqual("패치 테스트", self.correct_answer(132))
        for phrase in ("매회", "30분", "48시간", "생략하지 않는다"):
            self.assertIn(phrase, patch_text)

    def test_semipermanent_dye_matches_mfds_description(self):
        dye = self.questions[128]
        text = dye["question"] + dye["explanation"]
        self.assertEqual("반영구적 염모제", self.correct_answer(128))
        for phrase in ("모표피", "모피질", "이온결합"):
            self.assertIn(phrase, text)
        self.assertNotIn("4~6주", text)

        concept = self.concept_text("헤어컬러링의 원리와 종류")
        for phrase in ("이온결합", "매회", "30분", "48시간", "생략하지 않는다"):
            self.assertIn(phrase, concept)
        self.assertNotIn("4~6주", concept)
        self.assertNotIn("두피에서 1~2cm", concept)
        self.assertIn("시술 목적", concept)

    def test_current_public_hygiene_law_questions(self):
        self.assertIn("신고증", self.questions[9]["question"])
        self.assertIn("면허증 원본", self.questions[9]["question"])
        self.assertEqual("경고 또는 개선명령", self.correct_answer(9))
        self.assertNotIn("위생관리기준 위반의 1차 처분", self.questions[9]["explanation"])

        self.assertEqual("80만원", self.correct_answer(18))
        self.assertEqual("영업시설 및 설비개요서", self.correct_answer(20))
        self.assertIn("행정정보 공동이용", self.questions[20]["explanation"])

        self.assertEqual("면허취소", self.correct_answer(24))
        self.assertIn("면허정지 기간 중", self.questions[24]["question"])
        self.assertEqual("면허정지 3개월", self.correct_answer(231))

        posting = self.questions[235]
        posting_text = posting["question"] + " ".join(posting["options"]) + posting["explanation"]
        self.assertIn("최종지급요금표", posting_text)
        self.assertNotIn("최종지불요금표", posting_text)

    def test_current_license_disqualifications_keep_exact_exceptions(self):
        concept = self.concept_text("미용사 면허 - 취득 요건과 결격사유 · 취소사유")
        for phrase in (
            "피성년후견인",
            "전문의가 미용사 업무 수행에 적합하다고 인정",
            "결핵환자",
            "비감염성인 경우는 제외",
        ):
            self.assertIn(phrase, concept)

    def test_tattoo_guidance_reflects_2026_supreme_court_and_scope_limits(self):
        tattoo = self.questions[233]
        text = tattoo["question"] + " ".join(tattoo["options"]) + tattoo["explanation"]
        self.assertIn("통상적인 미용문신", text)
        self.assertIn("2021도15611", text)
        self.assertIn("개별", text)
        self.assertIn("미용사(일반)의 업무범위", text)
        self.assertNotIn("의료법 위반에 해당한다", self.correct_answer(233))

    def test_current_hygiene_education_fines_and_stable_rules(self):
        concept = self.concept_text("행정처분과 벌칙 · 위생서비스 수준평가(위생등급제)")
        for amount in ("1차 20만원", "2차 40만원", "3차 이상 60만원"):
            self.assertIn(amount, concept)
        self.assertNotIn("3차 100만원", concept)

        hygiene = self.concept_text("위생관리기준과 위생교육")
        self.assertIn("영업장 안의 조명도는 75럭스 이상", hygiene)
        self.assertNotIn("작업장 조명도", hygiene)

        notification = self.concept_text("공중위생관리법 총칙과 영업신고 · 폐업 · 승계")
        self.assertIn("폐업한 날부터 20일 이내", notification)

        disinfection = self.concept_text("화학적 소독법 - 소독제별 특성과 용도")
        self.assertIn("3% 석탄산수", disinfection)
        self.assertIn("3% 크레졸수", disinfection)

    def test_customer_service_does_not_invent_public_hygiene_penalties(self):
        consultation = self.questions[10]
        self.assertIn("전문적인 상담", self.correct_answer(10))
        self.assertNotIn("동의서", self.correct_answer(10))
        self.assertIn("필요한 경우", consultation["explanation"])

        concept = self.concept_text("고객응대 서비스(CS)")
        self.assertIn("직업윤리", concept)
        self.assertIn("개인정보", concept)
        self.assertNotIn("공중위생관리법상 벌칙", concept)
        self.assertNotIn("면허정지", concept)
        self.assertNotIn("모든 화학 시술", concept)
        self.assertIn("업소 정책", concept)

    def test_current_infectious_disease_and_disinfection_boundaries(self):
        infection = self.concept_text("감염병 관리 - 발생 3대 요소와 법정감염병 분류")
        self.assertIn("제1급 감염병은 18종", infection)
        self.assertNotIn("모든 감염병환자", infection)
        self.assertIn("감염원·감염경로·감수성 숙주", infection)
        self.assertNotIn("감염원(병원체)", infection)
        self.assertNotIn("병원체(감염원)", infection)

        disinfection = self.concept_text("화학적 소독법 - 소독제별 특성과 용도")
        self.assertIn("현행 법정 소독방법에는 포함되지 않는다", disinfection)
        self.assertIn("승홍수", disinfection)

        tools = self.concept_text("미용용구·미용기기와 소독 원칙")
        self.assertIn("재질", tools)
        self.assertIn("제조사 지침", tools)
        self.assertNotIn("자비소독·열소독 절대 금지", tools)
        self.assertNotIn("우드램프 색상 판별", tools)
        self.assertNotIn("외곡선상", tools)
        self.assertNotIn("비타민D 생성과 살균", tools)

        scissors = self.questions[92]
        self.assertIn("재질", self.correct_answer(92))
        self.assertIn("제조사 지침", self.correct_answer(92))
        self.assertNotIn("절대", scissors["question"] + " ".join(scissors["options"]) + scissors["explanation"])

        for title in ("화학적 소독법 - 소독제별 특성과 용도", "위생관리기준과 위생교육"):
            legal_method = self.concept_text(title)
            self.assertIn("에탄올", legal_method)
            self.assertRegex(legal_method, r"면(?: 또는 |·)거즈로 (?:기구 )?표면을 닦")

    def test_infection_factors_distinguish_source_from_pathogen(self):
        infection_factors = self.questions[189]
        self.assertEqual("감염원 - 감염경로 - 감수성 숙주", self.correct_answer(189))
        self.assertNotIn("병원체(감염원)", infection_factors["explanation"])

    def test_wood_lamp_and_uv_guidance_avoids_false_fixed_mappings(self):
        wood_device = self.questions[93]
        self.assertIn("어두운 환경", self.correct_answer(93))
        self.assertIn("보조", self.correct_answer(93))

        wood_preparation = self.questions[147]
        self.assertIn("오판을 줄이", self.correct_answer(147))

        ultraviolet = self.questions[97]
        self.assertIn("UVB", self.correct_answer(97))
        self.assertIn("UVC", self.correct_answer(97))

        reviewed_text = "\n".join(
            [
                wood_device["question"],
                *wood_device["options"],
                wood_device["explanation"],
                wood_preparation["question"],
                *wood_preparation["options"],
                wood_preparation["explanation"],
                ultraviolet["question"],
                *ultraviolet["options"],
                ultraviolet["explanation"],
                self.concept_text("미용용구·미용기기와 소독 원칙"),
                self.concept_text("피부유형별 특징과 피부 분석"),
            ]
        )
        for stale_phrase in (
            "황색=백색여드름",
            "피지가 많은 부위는 오렌지색",
            "지성/피지=오렌지색",
            "침투력 2mm",
            "60cm 5~7분",
            "살균 작용과 비타민D 생성",
        ):
            self.assertNotIn(stale_phrase, reviewed_text)

    def test_hair_cosmetic_legal_classification_is_current(self):
        concept = self.concept_text("화장품의 분류 (3) 모발화장품")
        self.assertIn("두발용 화장품", concept)
        self.assertIn("기능성화장품", concept)
        self.assertIn("일시적 색상변화 제품을 제외", concept)
        self.assertNotIn("의약외품 또는 기능성화장품", concept)
        self.assertNotIn("샴푸=음이온성", concept)
        self.assertNotIn("두피에는 도포하지 않음", concept)
        self.assertNotIn("pH 4.5~5.5", concept)
        self.assertIn("제품 표시", concept)

        legal_character = self.concept_text("화장품의 정의와 법적 성격")
        self.assertIn("기능성화장품은 화장품", legal_character)
        self.assertIn("의약외품은 별도", legal_character)
        self.assertNotIn("기능성화장품은 화장품과 의약품의 중간 영역", legal_character)
        self.assertNotIn("이 둘의 중간에 위치한 것이", legal_character)


if __name__ == "__main__":
    unittest.main()
