# 할 일 목록

상태별로 묶인 할 일 목록입니다. 브라우저만 있으면 됩니다. 빌드 단계도, 설치할 패키지도,
서버도 없습니다. 데이터는 브라우저의 localStorage에 남으므로 탭을 닫아도 유지됩니다.

왜 이런 구조인지는 [설계 결정](docs/design.md)에 있습니다.

## 실행하기

`src` 디렉터리에서 정적 서버를 띄우고 브라우저로 엽니다.

```bash
cd src
python3 -m http.server 8000
```

http://127.0.0.1:8000 을 엽니다. 처음 열면 예시 할 일 12건이 들어 있습니다.

Python이 없으면 Node로도 됩니다.

```bash
npx --yes serve src
```

파일을 더블클릭해서 여는 방식은 동작하지 않습니다. ES 모듈이라 `file://` 에서는 브라우저가
차단합니다. 반드시 서버를 거쳐야 합니다.

## 써보기

할 일을 추가하려면 헤더의 `새 할 일` 을 누릅니다. 제목과 담당자는 필수이고 마감일은 비워도
됩니다.

할 일을 고치려면 그 줄의 수정 버튼을 누릅니다. 상태도 여기서 바꿉니다. 선택지에는 지금
상태에서 갈 수 있는 상태만 나옵니다.

한 단계 앞으로 보내려면 줄 오른쪽 끝의 상태 버튼을 누릅니다. `완료` 인 할 일은 더 갈 곳이
없어서 버튼이 비활성입니다.

할 일을 지우면 확인창 없이 바로 지워지고 되돌리기가 뜹니다. 잘못 눌렀으면 되돌리기를 누릅니다.

## 저장된 데이터 초기화하기

주소 뒤에 `?reset=seed` 를 붙여서 엽니다.

```
http://127.0.0.1:8000/?reset=seed
```

저장된 내용을 지우고 예시 12건으로 되돌립니다.

## 검증 돌리기

앱을 실제 브라우저로 구동해서 동작을 증명하는 스크립트가 있습니다. 처음 한 번은 의존성을
설치합니다.

```bash
npm --prefix .claude/skills/verify-todo-ui/helpers install
```

그다음 실행합니다.

```bash
RUN_ID="run-$(date +%s)"
.claude/skills/verify-todo-ui/helpers/launch.sh "$RUN_ID" src
.claude/skills/verify-todo-ui/helpers/doctor.sh "$RUN_ID"
.claude/skills/verify-todo-ui/helpers/drive.mjs "$RUN_ID" .claude/skills/verify-todo-ui/journeys/crud.mjs
.claude/skills/verify-todo-ui/helpers/cleanup.sh "$RUN_ID"
```

`journeys` 디렉터리에는 `crud.mjs` 말고도 `status-advance.mjs` 와 `persistence.mjs` 가 있습니다.
세 번째 줄의 파일 이름만 바꿔서 각각 돌립니다.

스크린샷과 검사 결과는 `verification/$RUN_ID/` 에 남습니다. `cleanup.sh` 는 띄운 서버만 내리고
결과물은 지우지 않습니다.

Chromium 관련 오류가 나면 이 스크립트가 진단하고 고칩니다. 공유 라이브러리가 없으면
sudo 없이 사용자 영역에 풀어 넣고, 브라우저 자체가 없으면 받는 명령을 알려줍니다.

```bash
.claude/skills/verify-todo-ui/helpers/ensure-chrome.sh
```
