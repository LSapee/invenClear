# InvenClear

인벤 게시판에서 **내 글 / 내 댓글**을 한 번에 정리하고, 일부 게시판에서는 **No인장 필터**와 **주사위 찾기**를 사용할 수 있는 Chrome 확장 프로그램입니다.

## 주요 기능

- **내 글 삭제** (`?my=post`) — 체크박스로 여러 글을 선택하고 한 번에 삭제
- **내 댓글 삭제** (`?my=opi`) — 각 글의 댓글을 불러와 내 댓글만 선택 삭제
- **100개 초과 댓글 자동 펼침** — 접혀 있는 댓글 구간을 자동으로 열고 수집
- **주사위 댓글 대응** — 인벤 `/주사위` 기능으로 생성된 `dice` 댓글도 함께 처리
- **No인장 가리기 토글** — 게시글/댓글 가리기를 따로 켜고 끌 수 있으며, `maple`, `lostark`, `aion2` 게시판에서만 적용
- **10추글 제외** — 추천 10 이상 글은 No인장이어도 게시글과 댓글을 표시
- **주사위 찾기 도구** — 현재 글의 주사위 댓글에서 특정 숫자, 최대값, 최소값, N번째 큰 수를 검색

## 설치

### Chrome 웹스토어
> [Inven Clear 설치하러 가기](https://chromewebstore.google.com/detail/inven-clear/ojllcdhcdkeolkhogohpdkhebalhhagn?hl=ko)

### 내 글 / 내 댓글 정리
1. 인벤에 로그인
2. 내 글 목록(`?my=post`) 또는 내 댓글 목록(`?my=opi`) 페이지 접속
3. 삭제할 항목을 체크박스로 선택
4. **선택 삭제** 버튼 클릭

### No인장 가리기
1. Chrome 툴바에서 **Inven Clear** 아이콘 클릭
2. popup에서 **No인장 가리기** 토글 ON
3. 필요에 따라 **게시글 가리기**, **댓글 가리기**, **10추글 제외** 옵션 조정

토글을 켜면 글쓴이 칸 또는 댓글 닉네임 영역에 인증 아이콘이 없는 항목을 숨깁니다. 공지글은 숨기지 않습니다.

적용 게시판:
- `https://www.inven.co.kr/board/maple/`
- `https://www.inven.co.kr/board/lostark/`
- `https://www.inven.co.kr/board/aion2/`

`10추글 제외`를 켜면 추천 10 이상 글은 No인장이어도 목록에서 보이고, 해당 글의 댓글도 숨기지 않습니다.

### 주사위 찾기
1. 주사위 댓글이 있는 인벤 글 페이지 접속
2. Chrome 툴바에서 **Inven Clear** 아이콘 클릭
3. popup의 **주사위 찾기** 토글 ON
4. 검색 방식 선택 후 **확인** 클릭

댓글이 100개를 넘는 글은 접힌 댓글 구간을 자동으로 연 뒤 검색합니다. 결과를 클릭하면 해당 댓글 위치로 이동합니다.

마감 시간은 당일 댓글 시간 기준으로 처리합니다. `N번째로 큰 수`는 동일 숫자를 같은 순위로 계산합니다.

## 프로젝트 구조

```
invenClear/
├── src/
│   ├── manifest.json      # MV3 매니페스트
│   ├── content.js         # URL별 기능 라우터
│   ├── popup.html         # 확장 아이콘 popup UI
│   ├── popup.css          # popup 스타일
│   ├── popup.js           # popup 토글 상태 저장
│   ├── features/
│   │   ├── badgeFilter.js # No인장 가리기 기능
│   │   ├── diceFinder.js  # 주사위 댓글 검색
│   │   ├── posts.js       # 내 글 선택/삭제
│   │   └── comments.js    # 내 댓글 조회/선택/삭제
│   ├── shared/
│   │   ├── config.js      # 공통 설정/스토리지 키
│   │   ├── table.js       # 게시판 테이블 탐색
│   │   └── util.js        # 공통 유틸
│   ├── styles/
│   │   ├── base.css       # 공통 UI 스타일
│   │   ├── posts.css      # 게시글 전용 스타일
│   │   └── comments.css   # 댓글 전용 스타일
│   └── img/               # 아이콘 및 이미지
├── PRIVACY.md          # 개인정보처리방침
└── docs/
    ├── AI_COLLAB_NOTES.md       # AI 협업 개선 메모
    ├── resolved-improvements.md # 해결된 개선 내역
    └── TEST_CHECKLIST.md        # 배포 전 수동 테스트 체크리스트
```

## 주의사항

- 삭제된 글/댓글은 **복구할 수 없습니다.** 신중히 사용해 주세요.
- **No인장 가리기**는 `maple`, `lostark`, `aion2` 게시판 목록에서만 동작합니다.
- **주사위 찾기**의 마감 시간은 당일 기준입니다. 자정을 넘는 이벤트는 별도 보정하지 않습니다.
- 이 확장 프로그램은 인벤 공식 제품이 아니며, 인벤과 어떠한 제휴 관계도 없습니다.

## 개인정보처리방침

[PRIVACY.md](PRIVACY.md)를 참고해 주세요.
