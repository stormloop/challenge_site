import { styled } from 'styled-components';


const StyledWrapper = styled.div<{ bg_color: string }>`
width: 100%;
height: 100%;
position: relative;

.background {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    fill: ${({ bg_color }) => bg_color};
}

.default_pfp_icon {
    position: absolute;
    width: 90%;
    height: 90%;
    left: 0;
    top: 0;
    transform: translate(5%, 2.5%);
}

.default_pfp_group {
    width: 100%;
    height: 100%;
}

    `;


interface PfpProps {
    pfp: File | null,
    background_color: string
}

export const Pfp: React.FC<PfpProps> = ({ pfp, background_color }) => {
    return (
        <StyledWrapper bg_color={background_color}>
            {
                pfp == null ?
                    (
                        <div className="default_pfp_group">
                            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="background">
                                <circle cx="32" cy="32" r="32" />
                            </svg>
                            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 1024 1024" className="default_pfp_icon">
                                <path d="M0 0h1024v1024H0z" fill="none" />
                                <path fill="currentColor" d="M858.5 763.6a374 374 0 0 0-80.6-119.5a375.6 375.6 0 0 0-119.5-80.6c-.4-.2-.8-.3-1.2-.5C719.5 518 760 444.7 760 362c0-137-111-248-248-248S264 225 264 362c0 82.7 40.5 156 102.8 201.1c-.4.2-.8.3-1.2.5c-44.8 18.9-85 46-119.5 80.6a375.6 375.6 0 0 0-80.6 119.5A371.7 371.7 0 0 0 136 901.8a8 8 0 0 0 8 8.2h60c4.4 0 7.9-3.5 8-7.8c2-77.2 33-149.5 87.8-204.3c56.7-56.7 132-87.9 212.2-87.9s155.5 31.2 212.2 87.9C779 752.7 810 825 812 902.2c.1 4.4 3.6 7.8 8 7.8h60a8 8 0 0 0 8-8.2c-1-47.8-10.9-94.3-29.5-138.2M512 534c-45.9 0-89.1-17.9-121.6-50.4S340 407.9 340 362s17.9-89.1 50.4-121.6S466.1 190 512 190s89.1 17.9 121.6 50.4S684 316.1 684 362s-17.9 89.1-50.4 121.6S557.9 534 512 534" />
                            </svg>
                        </div>
                    )
                    : <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                        <mask id="circle_mask">
                            <circle r="32" cx="32" cy="32" fill="#ffffff" />
                        </mask>
                        <image xmlnsXlink="http://www.w3.org/1999/xlink" width="64" height="64" preserveAspectRatio="xMidYMid slice" xlinkHref={URL.createObjectURL(pfp)} mask="url(#circle_mask)" />
                    </svg>
            }
        </StyledWrapper>
    );
}

export default Pfp;
