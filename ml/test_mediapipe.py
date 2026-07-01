import cv2
import mediapipe as mp

mp_face_mesh = mp.solutions.face_mesh
mp_draw = mp.solutions.drawing_utils

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        print("FACE DETECTED")
        for face in results.multi_face_landmarks:
            mp_draw.draw_landmarks(
                frame,
                face,
                mp_face_mesh.FACEMESH_TESSELATION
            )
    else:
        print("NO FACE")

    cv2.imshow("MediaPipe Test", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
face_mesh.close()
cv2.destroyAllWindows()