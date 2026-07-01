import cv2

for i in range(5):
    cap = cv2.VideoCapture(i)
    ok, frame = cap.read()
    print(f"Camera {i}: opened={cap.isOpened()}, frame={ok}")
    if ok:
        cv2.imshow(f"Camera {i}", frame)
        cv2.waitKey(1000)
        cv2.destroyAllWindows()
    cap.release()